"""Export the Time Temple (TRIA TEMPORA V9.x) design data for the website.

Imports the game repo's own data module and solver (TempleV9Space.py / TempleV9Layout.py) - no geometry is
re-typed here. Usage: python export_temple.py <game repo> <out.json>
"""
import json
import os
import sys

repo, out = sys.argv[1], sys.argv[2]
sys.path.insert(0, os.path.join(repo, "Source", "UnrealShadows_LOTL", "Tools", "Stage2", "TempleV9"))
import TempleV9Space as S  # noqa: E402
import TempleV9Layout as L  # noqa: E402

places = {k: dict(x=v[0], y=v[1], z=v[2], era=v[3], label=v[4]) for k, v in S.PLACES.items()}
paths = []
for e in L.EDGES:
    paths.append(dict(a=e.a, b=e.b, kind=e.kind, era=e.era, oneway=e.oneway, keys=list(e.key),
                      door=e.door, name=e.name if (e.door or e.key) else None))
masses = [dict(id=m[0], eras=list(m[1]), kind=m[2], poly=m[3], z0=m[4], z1=m[5], note=m[6]) for m in S.MASSES]

# The solver's own fastest solo route, as the game's design audit computes it.
r = L.Rules(players=1)
secs, labels = L.shortest(r)
seq = L.node_seq(labels)
steps = []
for lab in labels:
    m = L._SW.match(lab)
    if m:
        steps.append(dict(type="switch", junction=m.group(2), frm=m.group(3), to=m.group(4)))
        continue
    parts = lab.split(" ", 2)
    if parts[1] in ("pull", "open"):
        steps.append(dict(type=parts[1], what=parts[2]))
    else:
        a, b = parts[2].split("->")
        steps.append(dict(type="move", kind=parts[1], a=a, b=b))

succ = L.explore(r)
data = dict(
    source="Source/UnrealShadows_LOTL/Tools/Stage2/TempleV9/TempleV9Space.py + TempleV9Layout.py",
    site=S.SITE, zRange=S.Z_RANGE, well=S.WELL, sunken=S.SUNKEN, pier=S.PIER,
    eraName=S.ERA_NAME, places=places, paths=paths, masses=masses,
    junctions={k: list(v) for k, v in S.JUNCTIONS.items()},
    moments={k: dict(place=v, name=S.MOMENT_NAME[k]) for k, v in S.LEVERS.items()},
    fragments={k: dict(place=v, name=S.FRAGMENT_NAME[k]) for k, v in S.FRAGMENTS.items()},
    start=S.START, goal=S.GOAL, crypt=S.CRYPT, oculus=S.OCULUS,
    solo=dict(seconds=round(secs, 1), steps=steps, places=seq),
    soloStates=len(succ), soloDeadStates=len(L.dead(r, succ)),
)
with open(out, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=1)
print("temple: %d places, %d paths, solo route %.1f s, %d states, %d dead" % (
    len(places), len(paths), secs, len(succ), data["soloDeadStates"]))
