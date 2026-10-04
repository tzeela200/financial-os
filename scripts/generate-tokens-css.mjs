// Generates src/app/tokens.css (CSS custom properties) from docs/design/tokens.json (ADR-004, single source).
import { readFileSync, writeFileSync } from "node:fs";
const t = JSON.parse(readFileSync("docs/design/tokens.json", "utf8"));
const lines = [];
const walk = (obj, prefix) => {
  for (const [k, v] of Object.entries(obj)) {
    if (k === "usage" || k.startsWith("$")) continue;
    const name = `${prefix}-${k}`;
    if (v && typeof v === "object" && !Array.isArray(v)) walk(v, name);
    else if (typeof v === "string" || typeof v === "number") {
      const px = typeof v === "number" && !["weight", "stroke"].some((w) => name.includes(w)) && !prefix.startsWith("--z") ? `${v}px` : v;
      lines.push(`  ${name}: ${prefix.startsWith("--motion-duration") ? `${v}ms` : px};`);
    }
  }
};
walk(t.color, "--color");
walk({ spacing: t.spacing, radius: t.radius, elevation: t.elevation, z: t["z-index"] }, "-");
walk({ duration: t.motion.duration }, "--motion");
lines.push(`  --motion-duration-opacity: var(--motion-duration-fast);`);
lines.push(`  --motion-easing-standard: ${t.motion.easing.standard};`, `  --motion-easing-exit: ${t.motion.easing.exit};`);
// typography (scale: size / line-height / weight per role; weights; numeric figures)
for (const [role, v] of Object.entries(t.typography.scale)) {
  lines.push(`  --type-${role}-size: ${v.size}px;`, `  --type-${role}-line: ${v.line}px;`, `  --type-${role}-weight: ${v.weight};`);
}
for (const [w, v] of Object.entries(t.typography.weight)) lines.push(`  --font-weight-${w}: ${v};`);
lines.push(`  --font-numeric: ${t.typography.numeric["font-variant-numeric"]};`);
// borders and focus ring
for (const [w, v] of Object.entries(t.border.width)) lines.push(`  --border-width-${w}: ${v}px;`);
lines.push(`  --focus-ring-width: ${t.border["focus-ring"].width}px;`, `  --focus-ring-offset: ${t.border["focus-ring"].offset}px;`, `  --selected-border-width: ${t.border.selected.width}px;`);
// icons and touch target
for (const [k, v] of Object.entries(t.icon.size)) lines.push(`  --icon-size-${k}: ${v}px;`);
lines.push(`  --icon-stroke: ${t.icon.stroke};`, `  --size-touch-target: ${t.icon["touch-target"]}px;`);
// breakpoints — for sizes (e.g. max-width); @media cannot read custom properties, media queries cite tokens.breakpoints
for (const [k, v] of Object.entries(t.breakpoints)) if (typeof v === "number") lines.push(`  --breakpoint-${k}: ${v}px;`);
const css = `/* GENERATED from docs/design/tokens.json by scripts/generate-tokens-css.mjs (ADR-004, immutable) — do not edit */\n:root {\n${lines.join("\n")}\n}\n/* reduced motion (ADR-004): all transitions instant, opacity keeps duration.fast */
@media (prefers-reduced-motion: reduce) {\n  :root { --motion-duration-fast: 0ms; --motion-duration-base: 0ms; --motion-duration-slow: 0ms; --motion-duration-opacity: ${t.motion.duration.fast}ms; }\n}\n`;
writeFileSync("src/app/tokens.css", css);
console.log(`tokens.css: ${lines.length} variables`);
