import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "@/lib/server/logger";
import { readSource } from "./readers";
import { extractStructured, EXTRACTOR_VERSION, type Extraction } from "./extract";
import { normalizeRows, NORMALIZER_VERSION, type NormalizedRow } from "./normalize-step";
import { verifyRows, VERIFICATION_RULE_VERSION, type CheckResult } from "./validate";
import { planPromotion } from "./promote";
import { familyForSource, sideForSource } from "./families";
import { conceptByCode } from "./concepts";
import type { Adapter } from "./adapter";
import { generateCandidates, RECONCILIATION_RULE_VERSION, type Tx } from "@/features/reconciliation/engine";

// Job runner for process_source / reprocess_source (18 V2 §7–§11; 18D §59 "jobs table + runner פשוט + State Machine").
// Runs on the server after the upload response or on a manual retry — never inside the upload request, never in the
// browser. One stage at a time with a recorded transition (18B §16): classification → extraction → (mapping) →
// normalization → verification → import-path promotion of complete rows (ADR-007) → reconciliation candidates
// (chapter 7). Business problems end in needs_review with an exception / review item; technical failures go back to
// the queue with backoff and finally to the DLQ (18 V2 §10B).

export const PROCESSING_VERSION = `${EXTRACTOR_VERSION}+${NORMALIZER_VERSION}+${VERIFICATION_RULE_VERSION}`;
const BUCKET = "financial-source-files";
const CHUNK = 300;

const EXCEPTION_FOR_CHECK: Record<string, { type: string; severity: string; action: string } | undefined> = {
  required_fields: { type: "missing_required_field", severity: "medium", action: "rows_missing_required_fields" },
  document_role: { type: "missing_required_field", severity: "medium", action: "document_type_meaning_missing" },
  net_plus_vat_equals_gross: { type: "amount_mismatch", severity: "low", action: "net_plus_vat_differs" },
  tax_id_structure: { type: "rule_not_resolved", severity: "low", action: "tax_id_structure_invalid" },
  balance_continuity: { type: "amount_mismatch", severity: "medium", action: "balance_sequence_gap" },
  invoice_receipt_duplicate_candidates: { type: "ambiguous_match", severity: "medium", action: "invoice_receipt_same_deal" },
};
const ACCOUNT_NAME: Record<string, string> = { checking: "חשבון בנק", payment_app: "bit / אפליקציית תשלום", credit_card: "כרטיס אשראי" };

type Claim = { job_id: string; job_type: string; attempt: number; correlation_id: string; file_id: string; source_id: string; storage_path: string; filename: string; source_type: string };

export async function loadAdapters(supabase: SupabaseClient, sourceType: string): Promise<Adapter[]> {
  const { data, error } = await supabase.from("rule_versions").select("id, logic_json").eq("domain", "source_adapter").eq("status", "active");
  if (error) throw new Error(`ADAPTERS_READ ${error.code}`);
  return (data ?? []).map((r) => ({ ...(r.logic_json as Adapter), id: r.id as string })).filter((a) => a.sourceType === sourceType);
}

/** Claims and runs due jobs of the signed-in user. Safe to call repeatedly (lease + idempotent writes). */
export async function runDueJobs(supabase: SupabaseClient, opts: { jobId?: string; max?: number } = {}): Promise<number> {
  let ran = 0;
  const owner = `runner-${crypto.randomUUID().slice(0, 8)}`;
  while (ran < (opts.max ?? 3)) {
    const { data, error } = await supabase.rpc("processing_claim", { p_lock_owner: owner, p_job_id: opts.jobId ?? null });
    if (error || !data) break;
    await runJob(supabase, data as Claim);
    ran++;
    if (opts.jobId) break;
  }
  return ran;
}

async function runJob(supabase: SupabaseClient, job: Claim) {
  const cid = job.correlation_id;
  let runVersion = PROCESSING_VERSION;
  const step = async (to: string, reason: string, documentId: string | null = null) => {
    const { error } = await supabase.rpc("processing_transition", { p_file_id: job.file_id, p_document_id: documentId, p_to: to, p_reason: reason, p_processing_version: runVersion, p_correlation_id: cid });
    if (error) throw new Error(`TRANSITION ${error.message}`);
  };
  const finish = (outcome: "succeeded" | "needs_review" | "failed_technical", code: string | null, detail: string | null) =>
    supabase.rpc("processing_finish_job", { p_job_id: job.job_id, p_outcome: outcome, p_error_code: code, p_detail: detail });
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw new Error(`${fn.toUpperCase()} ${error.message}`);
    return data;
  };

  try {
    // ---- classification (23A §35): family from the explicit source context; never invented
    await step("classification_pending", "job started");
    const family = familyForSource(job.source_type);
    if (!family) {
      await step("needs_review", "family not determined by the source context");
      await finish("needs_review", "FAMILY_UNDETERMINED", job.source_type);
      return;
    }
    await step("classified", `family ${family.code}`);

    // ---- read the immutable original (chapter 5 §21)
    await step("extraction_pending", "reading the stored original");
    const { data: blob, error: dl } = await supabase.storage.from(BUCKET).download(job.storage_path);
    if (dl || !blob) throw new Error("STORAGE_READ_FAILED");
    const read = await readSource(new Uint8Array(await blob.arrayBuffer()), job.filename);
    const adapters = read.ok ? await loadAdapters(supabase, job.source_type) : [];
    const extraction = read.ok ? extractStructured(read.sheets, adapters) : null;
    const adapter = extraction ? adapters.find((a) => a.id === extraction.adapterId) ?? null : null;
    // a run = pipeline version + approved adapter version (18B §17); a new adapter = a new run, the old one is kept (§5.8)
    runVersion = adapter ? `${PROCESSING_VERSION}+adapter:${adapter.id.slice(0, 8)}v${adapter.version}` : PROCESSING_VERSION;
    const doc = (await rpc("processing_begin_document", { p_file_id: job.file_id, p_processing_version: runVersion, p_family: family.code, p_correlation_id: cid })) as string;

    if (!read.ok || !extraction) {
      if (read.ok) throw new Error("EXTRACTION_FAILED");
      // not readable by the deterministic readers is not "no data" (chapter 5 §21): recorded, waits for its path
      const visual = read.reason === "visual_reading_required";
      await rpc("processing_record_checks", { p_document_id: doc, p_checks: [{ code: visual ? "visual_reading_required" : "format_readable", status: "failed", detail: read.detail ?? read.reason, rows: [], exception_type: visual ? "rule_not_resolved" : "unsupported_format", severity: "medium", action: visual ? "visual_reading_provider_needed" : "format_not_readable" }], p_processing_version: runVersion, p_correlation_id: cid });
      await rpc("processing_finish_document", { p_document_id: doc, p_summary: { reason: read.reason, detail: read.detail ?? null }, p_period_start: null, p_period_end: null, p_currency: "", p_correlation_id: cid });
      await step("needs_review", `not readable deterministically: ${read.reason}`, doc);
      await finish("needs_review", read.reason.toUpperCase(), read.detail ?? null);
      return;
    }

    // ---- extraction (+ normalization with the approved adapter rules, written beside the originals)
    const normalized = adapter ? normalizeRows(extraction.records, adapter) : [];
    await writeRecords(supabase, doc, job.file_id, runVersion, extraction, normalized, adapter);
    await step("extracted", `${extraction.records.length} rows read`, doc);

    if (!adapter) {
      const summary = { format: read.format, meta: read.meta, rows: extraction.records.length, dataRows: extraction.records.filter((r) => r.kind === "data").length, tables: extraction.tables, needsMapping: true };
      await rpc("processing_finish_document", { p_document_id: doc, p_summary: summary, p_period_start: null, p_period_end: null, p_currency: "", p_correlation_id: cid });
      await rpc("processing_flag_document", { p_document_id: doc, p_reason_code: "needs_mapping", p_required_action: "approve_column_mapping", p_severity: "medium" });
      await step("needs_review", "needs_mapping: no approved adapter for this structure", doc);
      await finish("needs_review", "NEEDS_MAPPING", null);
      return;
    }
    await step("normalization_pending", "normalizing mapped values", doc);
    await step("normalized", `${normalized.length} data rows`, doc);

    // ---- verification
    await step("verification_pending", "deterministic checks", doc);
    const side = sideForSource(job.source_type);
    const verification = verifyRows(normalized, family, adapter, side);
    const checks = verification.checks.map((c: CheckResult) => ({ ...c, exception_type: EXCEPTION_FOR_CHECK[c.code]?.type ?? null, severity: EXCEPTION_FOR_CHECK[c.code]?.severity ?? "info", action: EXCEPTION_FOR_CHECK[c.code]?.action ?? null }));
    await rpc("processing_record_checks", { p_document_id: doc, p_checks: checks, p_processing_version: runVersion, p_correlation_id: cid });

    // ---- import-path promotion of complete rows (ADR-007)
    const plan = planPromotion(normalized, family, adapter, verification, side);
    const sheetOf = (row: number) => normalized.find((r) => r.rowNumber === row)?.sheet ?? "";
    const promoted = (await rpc("processing_promote", {
      p_document_id: doc, p_account_type: plan.accountType ?? "checking", p_account_name: ACCOUNT_NAME[plan.accountType ?? "checking"],
      p_transactions: plan.transactions.map((t) => ({ key: t.key, row_number: t.rowNumber, sheet: sheetOf(t.rowNumber), date: t.date, value_date: t.valueDate, charge_date: t.chargeDate, direction: t.direction, amount_minor: t.amountMinor, currency: t.currency, description: t.description, reference: t.reference, balance_after_minor: t.balanceAfterMinor, type_code: t.typeCode })),
      p_documents: plan.documents.map((d) => ({ key: d.key, side: d.side, row_numbers: d.rowNumbers, sheet: sheetOf(d.rowNumbers[0]), role: d.role, date: d.date, document_number: d.documentNumber, party: d.party, gross_minor: d.grossMinor, net_minor: d.netMinor, vat_minor: d.vatMinor, currency: d.currency })),
      p_correlation_id: cid,
    })) as { transactions: number; documents: number };

    // ---- reconciliation candidates across all of the user's sources (chapter 7) — never auto-approved
    let candidates = 0;
    if (plan.transactions.length) candidates = await reconcile(supabase);

    const dates = [...plan.transactions.map((t) => t.date), ...plan.documents.map((d) => d.date)].sort();
    const summary = {
      format: read.format, meta: read.meta, adapterId: adapter.id, adapterVersion: adapter.version,
      rows: extraction.records.length, dataRows: normalized.length,
      promotedTransactions: promoted.transactions, promotedDocuments: promoted.documents, reconciliationCandidates: candidates,
      notPromoted: plan.notPromoted.length, notPromotedReasons: countReasons(plan.notPromoted),
      checks: verification.checks.map((c) => ({ code: c.code, status: c.status, detail: c.detail, rows: c.rows.slice(0, 100) })),
    };
    await rpc("processing_finish_document", { p_document_id: doc, p_summary: summary, p_period_start: dates[0] ?? null, p_period_end: dates[dates.length - 1] ?? null, p_currency: "", p_correlation_id: cid });
    await step(verification.state, `checks: ${verification.checks.map((c) => `${c.code}=${c.status}`).join(", ")}`, doc);
    await finish(verification.state === "verified" ? "succeeded" : "needs_review", null, null);
  } catch (e) {
    const message = (e as Error).message ?? "UNKNOWN";
    log("request_log", cid, { event: "processing_job_failed", job: job.job_id, attempt: job.attempt, code: message.split(/\s/)[0] });
    await finish("failed_technical", message.split(/\s/)[0], message.slice(0, 300));
    await supabase.rpc("processing_transition", { p_file_id: job.file_id, p_document_id: null, p_to: "failed", p_reason: message.slice(0, 200), p_processing_version: runVersion, p_correlation_id: cid });
  }
}

/** Generates reconciliation candidates over all of the user's canonical transactions (RLS-bound read). */
export async function reconcile(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.from("transactions")
    .select("id, account_id, transaction_date, charge_date, direction, amount_minor, currency_code, transaction_type_code, reconciliation_status, accounts!inner(account_type_code)")
    .is("archived_at", null).limit(20000);
  if (error) throw new Error(`RECONCILE_READ ${error.code}`);
  const txs: Tx[] = (data ?? []).map((t) => ({
    id: t.id as string, accountId: t.account_id as string, accountType: (t.accounts as unknown as { account_type_code: Tx["accountType"] }).account_type_code,
    date: t.transaction_date as string, chargeDate: (t.charge_date as string | null) ?? null, direction: t.direction as Tx["direction"],
    amountMinor: BigInt(t.amount_minor as number), currency: t.currency_code as string, typeCode: (t.transaction_type_code as string | null) ?? null,
    reconciliationStatus: t.reconciliation_status as string,
  }));
  const candidates = generateCandidates(txs);
  if (!candidates.length) return 0;
  const { data: n, error: wErr } = await supabase.rpc("reconciliation_write_candidates", {
    p_candidates: candidates.map((c) => ({ key: c.key, type: c.type, left: c.left, right: c.right, amount_minor: c.amountMinor.toString(), currency: c.currency, basis: c.basis })),
    p_rule_version: RECONCILIATION_RULE_VERSION,
  });
  if (wErr) throw new Error(`RECONCILE_WRITE ${wErr.message}`);
  return n as number;
}

function countReasons(items: { reasons: string[] }[]) {
  const m: Record<string, number> = {};
  for (const i of items) for (const r of i.reasons) m[r] = (m[r] ?? 0) + 1;
  return m;
}

async function writeRecords(supabase: SupabaseClient, documentId: string, fileId: string, runVersion: string, x: Extraction, normalized: NormalizedRow[], adapter: Adapter | null) {
  const byRow = new Map(normalized.map((n) => [`${n.sheet}#${n.rowNumber}`, n]));
  const payload = x.records.map((r) => {
    const n = byRow.get(`${r.sheet}#${r.rowNumber}`);
    return {
      row_key: `${r.sheet}#${r.rowNumber}`,
      row_number: r.rowNumber,
      // per-run hash: a new run (new adapter) writes its own records; earlier runs stay intact (18B §5.8)
      record_hash: createHash("sha256").update(`${fileId}|${runVersion}|${r.sheet}|${r.rowNumber}|${JSON.stringify(r.cells)}`).digest("hex"),
      raw: { sheet: r.sheet, kind: r.kind, cells: r.cells, run: runVersion, ...(r.locator ? { page: r.locator.page ?? null } : {}) },
      observations: r.observations.map((o) => {
        const normalizedValue = o.concept && n ? n.values[o.concept] ?? null : null;
        const dataType = o.concept ? conceptByCode(o.concept)?.dataType ?? "text" : "text";
        return {
          concept_code: o.concept ?? (r.kind === "data" ? "needs_mapping" : "document_text"),
          value_original: o.original,
          value_normalized: normalizedValue,
          data_type: dataType,
          currency_code: dataType === "money" ? n?.currency ?? "" : "",
          locator: { sheet: r.sheet, row: r.rowNumber, col: o.col + 1, header: o.header, page: r.locator?.page ?? null, cell_type: o.cell?.type ?? null, formula: o.cell?.formula ?? null, adapter_id: adapter?.id ?? null },
          unmapped: o.concept === null,
          confidence: o.concept ? 1 : null,
        };
      }),
    };
  });
  for (let i = 0; i < payload.length; i += CHUNK) {
    const { error } = await supabase.rpc("processing_write_records", { p_document_id: documentId, p_records: payload.slice(i, i + CHUNK) });
    if (error) throw new Error(`WRITE_RECORDS ${error.message}`);
  }
}
