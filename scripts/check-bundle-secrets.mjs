// Fails the build if server secrets appear in the client bundle (18D §56, 23B §74).
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
const root = ".next/static";
if (!existsSync(root)) { console.error("no .next/static — run the build first"); process.exit(1); }
const secrets = [process.env.SUPABASE_SERVICE_ROLE_KEY].filter(Boolean);
// sb_secret_ followed by a real key body; supabase-js itself contains the bare prefix to detect key formats
const patterns = [/SUPABASE_SERVICE_ROLE_KEY/, /service_role/i, /sb_secret_[A-Za-z0-9_-]{16,}/];
let hits = 0;
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    const s = readFileSync(p, "utf8");
    for (const r of patterns) if (r.test(s)) { console.error(`secret pattern ${r} in ${p}`); hits++; }
    for (const k of secrets) if (s.includes(k)) { console.error(`service role key value found in ${p}`); hits++; }
  }
};
walk(root);
if (hits) process.exit(1);
console.log("bundle clean: no server secrets in .next/static");
