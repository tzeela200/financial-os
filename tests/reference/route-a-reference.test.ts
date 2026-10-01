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
// Output (per file): how it was understood, questions left, records promoted, sample rows → REF_OUT (local file).

type Expect = { minRecords?: number; maxQuestions?: number; promotes?: "transaction" | "document" | "facts" | "none" };
type Entry = { file: string; sourceType: string; expect: Expect };
const dir = process.env.REF_DIR;
const manifestPath = process.env.REF_MANIFEST;
const enabled = !!dir && !!manifestPath && existsSync(manifestPath);

describe.skipIf(!enabled)("Route A reference corpus", () => {
  const manifest: Entry[] = enabled ? JSON.parse(readFileSync(manifestPath!, "utf8")) : [];
  const report: string[] = [];
  for (const e of manifest) {
    it(`${e.file} (${e.sourceType})`, async () => {
      const read = await readSource(new Uint8Array(readFileSync(join(dir!, e.file))), e.file);
      if (!read.ok) { report.push(`✗ ${e.file}: reader ${read.reason}`); expect(e.expect.promotes).toBe("none"); return; }
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
      const records = tx + docs + (e.expect.promotes === "facts" ? u.facts.length : 0);
      if (e.expect.minRecords !== undefined) expect(records).toBeGreaterThanOrEqual(e.expect.minRecords);
      if (e.expect.maxQuestions !== undefined) expect(questions.length).toBeLessThanOrEqual(e.expect.maxQuestions);
    }, 120000);
  }
});
