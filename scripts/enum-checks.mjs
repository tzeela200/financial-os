// Prints a CHECK clause for a glossary enum, so migrations copy values from the single source.
// Usage: node scripts/enum-checks.mjs <enum> [column]
import { readFileSync } from "node:fs";
const g = JSON.parse(readFileSync("docs/stage-0/glossary.json", "utf8"));
const [dict, col = dict] = process.argv.slice(2);
const v = g.enums[dict]?.values;
if (!v) { console.error(`unknown enum ${dict}`); process.exit(1); }
console.log(`check (${col} in (${v.map((x) => `'${x}'`).join(", ")}))`);
