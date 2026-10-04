import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readSource } from "@/features/processing/readers";
import { understandDocument } from "@/features/processing/understand";
import { verifyRows } from "@/features/processing/validate";
import { planPromotion } from "@/features/processing/promote";
import { sideForSource } from "@/features/processing/families";

// Acceptance run on the REFERENCE CORPUS (task 01.10 §11–§12): real representative documents, used in isolation for
// development and validation only. They never enter the repository or the app. The run is skipped unless
// REF_DIR points to a local folder and REF_MANIFEST to a local JSON manifest:
//   [{ "file": "x.csv", "sourceType": "p2p_payment", "expect": { "minRecords": 10, "maxQuestions": 0, "promotes": "transaction" } }]
// Readiness package schema (docs/implementation/route-a-readiness/manifest.json) is also accepted per entry:
//   family, subtype, format, provider, layout_variant, expected_concepts, expected_outputs, expected_counts_or_totals
//   ({ rows, transactions, documents, facts } — exact), evidence_assertions, allowed_questions (question kinds), unsupported.
//   "unknown" = not measured yet → not asserted.
// Output (per file): how it was understood, questions left, records promoted, sample rows → REF_OUT (local file);
// per-family acceptance status (matrix §Acceptance status) → REF_STATUS (local file).

type Expect = { minRecords?: number; maxQuestions?: number; promotes?: "transaction" | "document" | "facts" | "none" };
type Counts = { rows?: number; transactions?: number; documents?: number; facts?: number };
type Entry = {
  file: string; sourceType: string; expect?: Expect;
  family?: string; subtype?: string; format?: string; provider?: string; layout_variant?: string;
  expected_concepts?: string[] | "unknown"; expected_outputs?: string[] | "unknown"; expected_counts_or_totals?: Counts | "unknown";
  evidence_assertions?: string[] | "unknown"; allowed_questions?: string[] | "unknown"; unsupported?: string[] | "unknown";
};
type FamilyStatus = { fixture_count: number; formats_tested: Set<string>; layout_variants_tested: Set<string>; passed: number; open_ambiguities: Set<string>; unsupported: Set<string> };
const dir = process.env.REF_DIR;
const manifestPath = process.env.REF_MANIFEST;
const enabled = !!dir && !!manifestPath && existsSync(manifestPath);

describe.skipIf(!enabled)("Route A reference corpus", () => {
  const manifest: Entry[] = enabled ? JSON.parse(readFileSync(manifestPath!, "utf8")) : [];
  const report: string[] = [];
  const status = new Map<string, FamilyStatus>();
  for (const e of manifest) {
    it(`${e.file} (${e.sourceType})`, async () => {
      const read = await readSource(new Uint8Array(readFileSync(join(dir!, e.file))), e.file);
      const fam = e.family ?? e.sourceType;
      const st = status.get(fam) ?? { fixture_count: 0, formats_tested: new Set(), layout_variants_tested: new Set(), passed: 0, open_ambiguities: new Set(), unsupported: new Set() };
      status.set(fam, st);
      st.fixture_count++; st.formats_tested.add(e.format ?? e.file.split(".").pop()!); if (e.layout_variant) st.layout_variants_tested.add(e.layout_variant);
      if (Array.isArray(e.unsupported)) e.unsupported.forEach((x) => st.unsupported.add(x));
      const writeStatus = () => {
        if (!process.env.REF_STATUS) return;
        const lines = ["family | fixture_count | formats_tested | layout_variants_tested | passed | open_ambiguities | unsupported"];
        for (const [f, x] of status) lines.push(`${f} | ${x.fixture_count} | ${[...x.formats_tested].join(",")} | ${[...x.layout_variants_tested].join(",") || "-"} | ${x.passed}/${x.fixture_count} | ${[...x.open_ambiguities].join(",") || "-"} | ${[...x.unsupported].join(",") || "-"}`);
        writeFileSync(process.env.REF_STATUS, lines.join("\n"));
      };
      if (!read.ok) { report.push(`✗ ${e.file}: reader ${read.reason}`); st.unsupported.add(read.reason); writeStatus(); expect(e.expect?.promotes ?? "none", "an unreadable file must be declared unsupported").toBe("none"); st.passed++; writeStatus(); return; }
      const u = understandDocument(read, e.sourceType, []);
      const side = sideForSource(e.sourceType);
      const groups = new Map<string, number[]>();
      u.normalized.forEach((_, i) => { const a = u.adapterFor.get(i)!; groups.set(a.id, [...(groups.get(a.id) ?? []), i]); });
      let tx = 0, docs = 0, notPromoted = 0; const samples: string[] = []; const checks: string[] = [];
      for (const [, idx] of groups) {
        const rows = idx.map((i) => u.normalized[i]);
        const adapter = u.adapterFor.get(idx[0])!;
        const v = verifyRows(rows, u.family!, adapter, side);
        checks.push(...v.checks.map((c) => `${c.code}=${c.status}`), ...u.extraChecks.map((c) => `${c.code}=${c.status}`));
        const plan = planPromotion(rows, u.family!, adapter, v, side);
        tx += plan.transactions.length; docs += plan.documents.length; notPromoted += plan.notPromoted.length;
        samples.push(...plan.transactions.slice(0, 3).map((t) => `${t.date} ${t.direction} ${t.amountMinor} ${t.currency} ${t.description ?? ""}`));
        samples.push(...plan.documents.slice(0, 3).map((d) => `${d.date} ${d.role} ${d.grossMinor} ${d.currency} ${d.party ?? ""}`));
      }
      const questions = u.tables.flatMap((t) => t.questions);
      report.push(`${questions.length ? "?" : "✓"} ${e.file} [${e.sourceType}] tables=${u.tables.map((t) => `${t.sheet || "-"}:${t.via}`).join(",")} rows=${u.normalized.length} tx=${tx} docs=${docs} notPromoted=${notPromoted} facts=${u.facts.length}${u.factsAsOf ? `@${u.factsAsOf}` : ""} questions=${JSON.stringify(questions)} assumptions=${JSON.stringify(u.tables.flatMap((t) => t.assumptions))} checks=${[...new Set(checks)].join(";")}`);
      for (const s of samples) report.push(`    ${s}`);
      for (const t of u.tables) report.push(`    ${t.sheet}: ${t.decisions.filter((d) => d.concept).map((d) => `${d.header}→${d.concept}(${d.score.toFixed(2)})`).join(" | ")}`);
      if (process.env.REF_OUT) writeFileSync(process.env.REF_OUT, report.join("\n"));
      questions.forEach((q) => st.open_ambiguities.add(q.kind));
      writeStatus();
      const ex = e.expect ?? {};
      const records = tx + docs + (ex.promotes === "facts" ? u.facts.length : 0);
      if (ex.minRecords !== undefined) expect(records).toBeGreaterThanOrEqual(ex.minRecords);
      if (ex.maxQuestions !== undefined) expect(questions.length).toBeLessThanOrEqual(ex.maxQuestions);
      const c = e.expected_counts_or_totals;
      if (c && c !== "unknown") {
        if (c.rows !== undefined) expect(u.normalized.length, "rows").toBe(c.rows);
        if (c.transactions !== undefined) expect(tx, "transactions").toBe(c.transactions);
        if (c.documents !== undefined) expect(docs, "documents").toBe(c.documents);
        if (c.facts !== undefined) expect(u.facts.length, "facts").toBe(c.facts);
      }
      const allowed = e.allowed_questions;
      if (allowed && allowed !== "unknown") for (const q of questions) expect(allowed, `question "${q.kind}" not allowed`).toContain(q.kind);
      st.passed++; writeStatus();
    }, 120000);
  }
});
