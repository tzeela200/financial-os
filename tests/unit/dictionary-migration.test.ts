import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// DI-5: dictionary_values was filled only by seed.sql, which runs on a local reset and never in production (0 rows there).
// Migration 026 carries the same canonical values (docs/stage-0/glossary.json) so production has them too.
describe("dictionary values in production", () => {
  it("migration 026 inserts every canonical glossary value", () => {
    const g = JSON.parse(readFileSync("docs/stage-0/glossary.json", "utf8")) as { enums: Record<string, { values: string[] }> };
    const file = readdirSync("supabase/migrations").find((f) => /^\d+_run_lineage/.test(f));
    expect(file).toBeTruthy();
    const sql = readFileSync(`supabase/migrations/${file}`, "utf8");
    const missing: string[] = [];
    for (const [dict, spec] of Object.entries(g.enums)) {
      spec.values.forEach((code, i) => {
        if (!sql.includes(`('${dict}', '${code.replaceAll("'", "''")}', ${i})`)) missing.push(`${dict}.${code}`);
      });
    }
    expect(missing).toEqual([]);
  });
});
