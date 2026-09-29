"""WCAG 2.x contrast check for ADR-004 tokens. Normal text needs >= 4.5, UI/large >= 3.0."""
import json, pathlib, sys
T = json.loads((pathlib.Path(__file__).parents[2] / "design" / "tokens.json").read_text(encoding="utf8"))
c = T["color"]
def lum(h):
    h = h.lstrip("#"); r, g, b = (int(h[i:i+2], 16) / 255 for i in (0, 2, 4))
    f = lambda v: v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True); return (la + 0.05) / (lb + 0.05)
bgs = {"surface": c["neutral"]["surface"], "canvas": c["neutral"]["canvas"], "surface-subtle": c["neutral"]["surface-subtle"]}
checks = []  # (name, fg, bg, min)
for k in ["primary", "secondary", "tertiary", "link"]:
    for bn, bv in bgs.items(): checks.append((f"text.{k} on {bn}", c["text"][k], bv, 4.5))
for grp in ["financial", "reliability"]:
    for k, v in c[grp].items():
        for bn, bv in bgs.items(): checks.append((f"{grp}.{k} on {bn}", v, bv, 4.5))
for k, v in c["semantic"].items():
    checks.append((f"semantic.{k}.fg on own bg", v["fg"], v["bg"], 4.5))
    checks.append((f"semantic.{k}.fg on surface", v["fg"], c["neutral"]["surface"], 4.5))
checks.append(("text.inverse on brand.600 (primary button)", c["text"]["inverse"], c["brand"]["600"], 4.5))
checks.append(("text.inverse on brand.700 (hover)", c["text"]["inverse"], c["brand"]["700"], 4.5))
checks.append(("text.inverse on error.fg (danger button)", c["text"]["inverse"], c["semantic"]["error"]["fg"], 4.5))
checks.append(("brand.600 on selected-bg", c["brand"]["600"], c["interaction"]["selected-bg"], 4.5))
checks.append(("focus-ring vs surface (UI)", c["interaction"]["focus-ring"], c["neutral"]["surface"], 3.0))
checks.append(("focus-ring vs canvas (UI)", c["interaction"]["focus-ring"], c["neutral"]["canvas"], 3.0))
checks.append(("border.strong vs surface (input border, UI)", c["border"]["strong"], c["neutral"]["surface"], 3.0))
fail = 0
for n, fg, bg, mn in checks:
    r = ratio(fg, bg); ok = r >= mn; fail += not ok
    print(f"{'PASS' if ok else 'FAIL'}  {r:5.2f} (min {mn})  {n}")
print(f"\n{len(checks)} checks, {fail} failed"); sys.exit(1 if fail else 0)
