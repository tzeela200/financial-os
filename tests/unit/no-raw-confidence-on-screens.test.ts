import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// MASTER_SPEC 19.09 §22 (CL-0049 (3); route-a-completion §2א DI-4 step 3): user screens show semantic Hebrew status
// only — no raw confidence scores and no Skill names.
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });

describe("screens (MASTER_SPEC §22)", () => {
  const sources = [...files("src/app"), ...files("src/components")].map((p) => ({ p, s: readFileSync(p, "utf8") }));

  it("never render a raw score as a percentage", () => {
    expect(sources.filter(({ s }) => /(score|confidence)\w*\s*\*\s*100/i.test(s)).map(({ p }) => p)).toEqual([]);
  });

  it("never render a Skill name", () => {
    expect(sources.filter(({ s }) => /["'`>]\s*israeli-[a-z-]+/.test(s)).map(({ p }) => p)).toEqual([]);
  });
});
