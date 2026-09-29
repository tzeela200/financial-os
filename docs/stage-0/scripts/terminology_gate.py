"""Terminology Gate (Amendment 7): no duplicate entity/enum/status names, no value defined twice with
conflicting meaning, no non-canonical spelling used as a canonical value."""
import json, pathlib, sys, collections
G = json.loads((pathlib.Path(__file__).parents[1] / "glossary.json").read_text(encoding="utf8"))
errors = []
enums = G["enums"]
# 1. duplicate enum names (case/underscore-insensitive)
keys = collections.Counter(k.replace("_", "").lower() for k in enums)
errors += [f"duplicate enum name: {k}" for k, n in keys.items() if n > 1]
# 2. duplicate values inside one enum
for name, spec in enums.items():
    dup = [v for v, n in collections.Counter(spec["values"]).items() if n > 1]
    if dup: errors.append(f"{name}: duplicate values {dup}")
    for bad in spec.get("normalized_from", {}):
        if bad in spec["values"]: errors.append(f"{name}: non-canonical '{bad}' still listed as value")
# 3. duplicate entity names across layers
ents = [e for layer in G["entities"].values() for e in layer]
errors += [f"duplicate entity: {e}" for e, n in collections.Counter(ents).items() if n > 1]
# 4. read models / commands / workspaces duplicates and forbidden aliases
for sect in ("read_models", "commands", "workspaces", "buckets"):
    vals = G[sect]["values"]
    errors += [f"{sect}: duplicate {v}" for v, n in collections.Counter(vals).items() if n > 1]
    for bad in G[sect].get("normalized_from", {}):
        if bad in vals: errors.append(f"{sect}: non-canonical '{bad}' still listed")
# 5. enum name must not collide with an entity name
errors += [f"enum/entity name collision: {k}" for k in enums if k in ents]
# 6. canonical semantic guards
guard = {"coverage_status": ["substantially_complete", "missing"], "verification_status": ["reported", "likely_verified"]}
for k, bad in guard.items():
    errors += [f"{k}: forbidden value {b}" for b in bad if b in enums[k]["values"]]
# report open gaps/decisions (not errors, but gate requires them resolved or deferred explicitly)
open_refs = sorted({s.get("gap_ref") or s.get("decision_ref") for s in enums.values() if s.get("gap_ref") or s.get("decision_ref")})
open_refs += [f"{sect}.gaps:{k}" for sect in ("read_models", "commands") for k in G[sect].get("gaps", {})]
print(f"enums={len(enums)} entities={len(ents)} read_models={len(G['read_models']['values'])} commands={len(G['commands']['values'])} workspaces={len(G['workspaces']['values'])}")
for e in errors: print("ERROR", e)
print("OPEN (must be resolved/deferred before Gate 0):", open_refs or "none")
sys.exit(1 if errors else 0)
