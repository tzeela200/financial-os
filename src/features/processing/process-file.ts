import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "@/lib/server/logger";
import { readSource } from "./readers";
import { EXTRACTOR_VERSION, type Extraction } from "./extract";
import { NORMALIZER_VERSION, type NormalizedRow } from "./normalize-step";
import { verifyRows, VERIFICATION_RULE_VERSION, type CheckResult } from "./validate";
import { planPromotion, type PromotionPlan } from "./promote";
import { familyForSource, sideForSource } from "./families";
import { conceptByCode } from "./concepts";
import type { Adapter } from "./adapter";
import { understandDocument } from "./understand";
import { SEMANTIC_ENGINE_VERSION } from "./semantic";
import { generateCandidates, RECONCILIATION_RULE_VERSION, type Tx } from "@/features/reconciliation/engine";
import { CAL_ADAPTER_ID, CAL_ADAPTER_VERSION } from "./documents/cal-statement";

// Job runner for process_source / reprocess_source (18 V2 §7–§11; 18D §59 "jobs table + runner פשוט + State Machine").
// Runs on the server after the upload response or on a manual retry — never inside the upload request, never in the
// browser. Stages with a recorded transition (18B §16): classification → document understanding (understand.ts: document
// adapters → approved mappings → semantic engine) → normalization → verification → import-path promotion of complete
// rows (ADR-007) → reconciliation candidates (chapter 7). Only what stays ambiguous ends in needs_mapping (chapter 5
// §21); understood tables of the same document are still promoted. Business problems end in needs_review with an
// exception / review item; technical failures go back to the queue with backoff and finally to the DLQ (18 V2 §10B).

export const PROCESSING_VERSION = `${EXTRACTOR_VERSION}+${NORMALIZER_VERSION}+${VERIFICATION_RULE_VERSION}+${SEMANTIC_ENGINE_VERSION}`;
const BUCKET = "financial-source-files";
const CHUNK = 300;

const EXCEPTION_FOR_CHECK: Record<string, { type: string; severity: string; action: string } | undefined> = {
  required_fields: { type: "missing_required_field", severity: "medium", action: "rows_missing_required_fields" },
  document_role: { type: "missing_required_field", severity: "medium", action: "document_type_meaning_missing" },
  net_plus_vat_equals_gross: { type: "amount_mismatch", severity: "low", action: "net_plus_vat_differs" },
  tax_id_structure: { type: "rule_not_resolved", severity: "low", action: "tax_id_structure_invalid" },
  balance_continuity: { type: "amount_mismatch", severity: "medium", action: "balance_sequence_gap" },
  invoice_receipt_duplicate_candidates: { type: "ambiguous_match", severity: "medium", action: "invoice_receipt_same_deal" },
  statement_totals: { type: "amount_mismatch", severity: "high", action: "statement_total_differs_from_transactions" },
  table_not_understood: { type: "rule_not_resolved", severity: "medium", action: "table_meaning_not_recognised" },
  // classification from the content (ADR-008 v2): the file is identified, nothing is promoted under the wrong family
  uploaded_to_other_source: { type: "rule_not_resolved", severity: "medium", action: "upload_to_matching_source" },
  family_no_reading_path: { type: "unsupported_format", severity: "low", action: "family_reading_path_needed" },
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

    // ---- read the immutable original + understand it (chapter 5 §1–§5, §20–§21)
    await step("extraction_pending", "reading the stored original");
    const { data: blob, error: dl } = await supabase.storage.from(BUCKET).download(job.storage_path);
    if (dl || !blob) throw new Error("STORAGE_READ_FAILED");
    const read = await readSource(new Uint8Array(await blob.arrayBuffer()), job.filename);
    const approved = read.ok ? await loadAdapters(supabase, job.source_type) : [];
    const u = read.ok ? understandDocument(read, job.source_type, approved) : null;
    // a run = pipeline version + how each table was understood (18B §17); a new mapping = a new run, the old one is kept (§5.8)
    const how = (u?.tables ?? []).map((t) => t.via === "document_adapter" ? `${CAL_ADAPTER_ID}v${CAL_ADAPTER_VERSION}` : t.adapter ? `${t.adapter.id}v${t.adapter.version}` : `unresolved:${t.sheet}`).join(",");
    runVersion = how ? `${PROCESSING_VERSION}+${createHash("sha256").update(how).digest("hex").slice(0, 12)}` : PROCESSING_VERSION;
    // the family identified from the content (chapter 5 §2; ADR-008 v2); the upload source is only a hint
    const fam = u?.family ?? family;
    const cls = u?.classification ?? null;
    // nothing is promoted under a family the content does not show: another source's file waits to be uploaded there;
    // a family without a reading path is kept as evidence. Payment proofs are evidence by definition (never new money).
    const blockPromotion = !!cls && ((cls.mismatch && cls.supported && fam.code !== "payment_proofs") || !cls.supported);
    const doc = (await rpc("processing_begin_document", { p_file_id: job.file_id, p_processing_version: runVersion, p_family: fam.code, p_correlation_id: cid })) as string;

    if (!read.ok || !u) {
      if (read.ok) throw new Error("EXTRACTION_FAILED");
      // not readable by the deterministic readers is not "no data" (chapter 5 §21): recorded, waits for its path
      const visual = read.reason === "visual_reading_required";
      await rpc("processing_record_checks", { p_document_id: doc, p_checks: [{ code: visual ? "visual_reading_required" : "format_readable", status: "failed", detail: read.detail ?? read.reason, rows: [], exception_type: visual ? "rule_not_resolved" : "unsupported_format", severity: "medium", action: visual ? "visual_reading_provider_needed" : "format_not_readable" }], p_processing_version: runVersion, p_correlation_id: cid });
      await rpc("processing_finish_document", { p_document_id: doc, p_summary: { reason: read.reason, detail: read.detail ?? null }, p_period_start: null, p_period_end: null, p_currency: "", p_correlation_id: cid });
      await step("needs_review", `not readable deterministically: ${read.reason}`, doc);
      await finish("needs_review", read.reason.toUpperCase(), read.detail ?? null);
      return;
    }

    // ---- extraction: every line kept as evidence; understood values written beside their originals
    await writeRecords(supabase, doc, job.file_id, runVersion, u.extraction, u.normalized, u.adapterFor);
    await step("extracted", `${u.extraction.records.length} rows read; tables: ${u.tables.map((t) => t.via).join(", ") || "none"}`, doc);
    await step("normalization_pending", "normalizing understood values", doc);
    await step("normalized", `${u.normalized.length} data rows`, doc);

    // ---- verification + promotion plan per understood table (each with its own sign / currency semantics)
    await step("verification_pending", "deterministic checks", doc);
    const side = sideForSource(job.source_type);
    const groups = new Map<string, { adapter: Adapter; rows: NormalizedRow[] }>();
    u.normalized.forEach((n, i) => {
      const a = u.adapterFor.get(i);
      if (!a) return;
      const k = `${a.id}|${n.sheet}`;
      const g = groups.get(k) ?? { adapter: a, rows: [] };
      g.rows.push(n);
      groups.set(k, g);
    });
    const allChecks: CheckResult[] = [...u.extraChecks];
    if (cls?.mismatch && cls.supported && fam.code !== "payment_proofs") allChecks.push({ code: "uploaded_to_other_source", status: "failed", detail: `${cls.hint ?? "-"} → ${fam.code}: ${cls.basis.join("; ")}`, rows: [] });
    if (cls && !cls.supported) allChecks.push({ code: "family_no_reading_path", status: "failed", detail: `${fam.code}: ${cls.basis.join("; ")}`, rows: [] });
    const plans: { plan: PromotionPlan; rows: NormalizedRow[] }[] = [];
    let state: "verified" | "needs_review" = u.needsMapping || u.extraChecks.some((c) => c.status !== "passed") || blockPromotion ? "needs_review" : "verified";
    for (const g of groups.values()) {
      const v = verifyRows(g.rows, fam, g.adapter, side);
      allChecks.push(...v.checks);
      if (v.state === "needs_review") state = "needs_review";
      if (!blockPromotion) plans.push({ plan: planPromotion(g.rows, fam, g.adapter, v, side), rows: g.rows });
    }
    const checks = allChecks.map((c) => ({ ...c, exception_type: EXCEPTION_FOR_CHECK[c.code]?.type ?? null, severity: EXCEPTION_FOR_CHECK[c.code]?.severity ?? "info", action: EXCEPTION_FOR_CHECK[c.code]?.action ?? null }));
    if (checks.length) await rpc("processing_record_checks", { p_document_id: doc, p_checks: checks, p_processing_version: runVersion, p_correlation_id: cid });

    // ---- import-path promotion of complete rows (ADR-007)
    let promotedTx = 0, promotedDocs = 0, plannedTx = 0;
    for (const { plan, rows } of plans) {
      if (!plan.transactions.length && !plan.documents.length) continue;
      const sheetOf = (row: number) => rows.find((r) => r.rowNumber === row)?.sheet ?? "";
      const res = (await rpc("processing_promote", {
        p_document_id: doc, p_account_type: plan.accountType ?? "checking", p_account_name: ACCOUNT_NAME[plan.accountType ?? "checking"],
        p_transactions: plan.transactions.map((t) => ({ key: t.key, legacy_key: t.legacyKey, row_number: t.rowNumber, sheet: sheetOf(t.rowNumber), date: t.date, value_date: t.valueDate, charge_date: t.chargeDate, direction: t.direction, amount_minor: t.amountMinor, currency: t.currency, description: t.description, reference: t.reference, balance_after_minor: t.balanceAfterMinor, type_code: t.typeCode })),
        p_documents: plan.documents.map((d) => ({ key: d.key, side: d.side, row_numbers: d.rowNumbers, sheet: sheetOf(d.rowNumbers[0]), role: d.role, date: d.date, document_number: d.documentNumber, party: d.party, gross_minor: d.grossMinor, net_minor: d.netMinor, vat_minor: d.vatMinor, currency: d.currency })),
        p_correlation_id: cid,
      })) as { transactions: number; documents: number };
      promotedTx += res.transactions; promotedDocs += res.documents; plannedTx += plan.transactions.length;
    }

    // ---- reported facts: a card's credit limit is its own record — never money available (chapter 13);
    //      a bank document's stated balance is a reported balance with its date (chapter 5 §6)
    const st = u.statement;
    if (st?.creditLimit && plannedTx) {
      await rpc("processing_upsert_facility", { p_document_id: doc, p_facility: { limit_minor: st.creditLimit.minor, currency: st.creditLimit.currency, as_of_date: st.asOf ?? st.statementDate ?? "", effective_to: st.limitValidUntil ?? "" }, p_correlation_id: cid });
    }
    if (u.bankBalance && !blockPromotion) {
      await rpc("processing_record_balance", { p_document_id: doc, p_balance_minor: u.bankBalance.minor, p_currency: u.bankBalance.currency, p_as_of: u.bankBalance.asOf, p_line: u.bankBalance.line, p_quoted: { label: u.bankBalance.label, value: u.bankBalance.value }, p_correlation_id: cid });
    }

    // ---- reconciliation candidates across all of the user's sources (chapter 7) — never auto-approved
    let candidates = 0;
    if (plannedTx) candidates = await reconcile(supabase);

    const dates = plans.flatMap(({ plan }) => [...plan.transactions.map((t) => t.date), ...plan.documents.map((d) => d.date)]).sort();
    const notPromoted = plans.flatMap(({ plan }) => plan.notPromoted);
    const sampleOf = (sheet: string, col: number) => [...new Set(u.extraction.records.filter((r) => r.sheet === sheet && r.kind === "data").map((r) => r.cells[col] ?? "").filter(Boolean))].slice(0, 6);
    const summary = {
      format: read.format, meta: read.meta, needsMapping: u.needsMapping,
      classification: cls,
      adapterId: u.primaryAdapter?.id ?? null, adapterVersion: u.primaryAdapter?.version ?? null,
      // how the system understood the document (chapter 5 §21 — the basis of every decision is kept and shown)
      understanding: {
        tables: u.tables.map((t) => ({
          sheet: t.sheet, headerRow: t.headerRow, via: t.via, dataRows: t.dataRows, adapterId: t.adapter?.id ?? null,
          decisions: t.decisions.map((d) => ({ index: d.index, header: d.header, concept: d.concept, score: Math.round(d.score * 100) / 100, basis: d.basis, alternatives: d.alternatives.slice(0, 3), sample: sampleOf(t.sheet, d.index) })),
          questions: t.questions, assumptions: t.assumptions,
        })),
        facts: u.facts.slice(0, 60), factsAsOf: u.factsAsOf, bankBalance: u.bankBalance,
        // reconciliation counts as applied only when it produced candidates across sources (never on a single source)
        route: u.route ? { ...u.route, skills: u.route.skills.map((k) => (k.skill === "israeli-bank-reconciliation" && candidates > 0 ? { ...k, applied: true, reason: `${candidates} candidates across sources` } : k)) } : null,
      },
      statement: st ? { issuer: st.issuer, cardLast4: st.cardLast4, statementDate: st.statementDate, asOf: st.asOf, creditLimit: st.creditLimit, nextChargeDate: st.nextChargeDate, limitValidUntil: st.limitValidUntil, transactions: st.transactions.length, totals: st.totals.map((t) => ({ chargeDate: t.chargeDate, total: t.total })) } : null,
      rows: u.extraction.records.length, dataRows: u.normalized.length,
      promotedTransactions: promotedTx, promotedDocuments: promotedDocs, reconciliationCandidates: candidates,
      notPromoted: notPromoted.length, notPromotedReasons: countReasons(notPromoted),
      checks: allChecks.map((c) => ({ code: c.code, status: c.status, detail: c.detail, rows: c.rows.slice(0, 100) })),
    };
    await rpc("processing_finish_document", { p_document_id: doc, p_summary: summary, p_period_start: dates[0] ?? null, p_period_end: dates[dates.length - 1] ?? null, p_currency: "", p_correlation_id: cid });
    if (u.needsMapping) {
      await rpc("processing_flag_document", { p_document_id: doc, p_reason_code: "needs_mapping", p_required_action: "answer_mapping_questions", p_severity: "medium" });
    }
    await step(state, u.needsMapping ? "needs_mapping: open questions on what is still ambiguous" : `checks: ${allChecks.map((c) => `${c.code}=${c.status}`).join(", ")}`, doc);
    await finish(state === "verified" ? "succeeded" : "needs_review", u.needsMapping ? "NEEDS_MAPPING" : null, null);
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

async function writeRecords(supabase: SupabaseClient, documentId: string, fileId: string, runVersion: string, x: Extraction, normalized: NormalizedRow[], adapterFor: Map<number, Adapter>) {
  const byRow = new Map(normalized.map((n, i) => [`${n.sheet}#${n.rowNumber}`, { n, adapter: adapterFor.get(i) ?? null }]));
  const payload = x.records.map((r) => {
    const hit = byRow.get(`${r.sheet}#${r.rowNumber}`);
    const n = hit?.n;
    return {
      row_key: `${r.sheet}#${r.rowNumber}`,
      row_number: r.rowNumber,
      // per-run hash: a new run (new understanding / mapping) writes its own records; earlier runs stay intact (18B §5.8)
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
          locator: { sheet: r.sheet, row: r.rowNumber, col: o.col + 1, header: o.header, page: r.locator?.page ?? null, cell_type: o.cell?.type ?? null, formula: o.cell?.formula ?? null, adapter_id: hit?.adapter?.id ?? null },
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
