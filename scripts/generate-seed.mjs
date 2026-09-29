// Generates supabase/seed.sql from the canonical glossary. Do not edit seed.sql by hand.
import { readFileSync, writeFileSync } from "node:fs";
const g = JSON.parse(readFileSync("docs/stage-0/glossary.json", "utf8"));
const q = (s) => `'${String(s).replaceAll("'", "''")}'`;
const rows = [];
for (const [dict, spec] of Object.entries(g.enums)) {
  spec.values.forEach((code, i) => rows.push(`(${q(dict)}, ${q(code)}, ${i})`));
}
const sql =
  `-- GENERATED from docs/stage-0/glossary.json by scripts/generate-seed.mjs — do not edit by hand\n` +
  `insert into public.dictionary_values (dictionary, code, sort_order) values\n${rows.join(",\n")}\n` +
  `on conflict (dictionary, code) do update set sort_order = excluded.sort_order, active = true;\n`;
writeFileSync("supabase/seed.sql", sql);
console.log(`seed: ${rows.length} values in ${Object.keys(g.enums).length} dictionaries`);
