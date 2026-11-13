"""Export Level_02's gravity cube for the website's 3-D view.

Reads a geometry dump that the game repo's own tool wrote (Tools/Stage2/DumpStage2Geometry.py run in the editor,
JSON under Saved/**/geometry-dump.json). It keeps: the gravity rooms (AUS_GravityZone), the 12 seams, the collision
boxes inside the cube, and the gameplay landmarks (artifacts, swords, guards, the core). Nothing is re-modelled.
Usage: python export_cube.py <game repo> <dump relative to repo> <out.json>
"""
import json
import math
import os
import sys

repo, dump, out = sys.argv[1], sys.argv[2], sys.argv[3]
with open(os.path.join(repo, dump), encoding="utf-8") as f:
    d = json.load(f)
P = d["parts"]
R2 = lambda v: [round(x, 1) for x in v]

CUBE_ROOMS = ("Floor", "WallN", "WallS", "WallE", "WallW", "Ceiling")
LANES = ("Shaft", "ChimneyE", "ChimneyEPassage", "FlingX", "LaunchW", "VoidW", "VoidE", "VoidS", "VoidN")
zones = []
for z in d["zones"]:
    if z["room"] in CUBE_ROOMS + LANES:
        up = z["axes_unit"][2]
        zones.append(dict(room=z["room"], kind="face" if z["room"] in CUBE_ROOMS else "lane", origin=R2(z["origin"]),
                          axes=[R2(a) for a in z["axes_unit"]], extent=R2(z["extent"]),
                          gravity=R2([-up[0], -up[1], -up[2]])))


def inside(p):
    c = p["center"]
    return abs(c[0]) < 3500 and abs(c[1]) < 2700 and -300 < c[2] < 5200


def half_len(a):
    return math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2)


boxes, slabs = [], 0
for p in P:
    if not (p["block"] and inside(p)):
        continue
    ext = sorted(half_len(a) for a in p["axes"])
    if ext[1] > 2000:          # the six 48 m face slabs: drawn as faces instead
        slabs += 1
        continue
    if ext[2] < 15:            # slivers
        continue
    c = p["center"]
    # the cube's own walls: big slabs sitting on (or just outside) a face plane. Drawn see-through on the site.
    # thin axis along a cube axis + centre on/behind that face's inner surface = part of the face itself
    thin = min(p["axes"], key=half_len)
    n = [abs(v) / max(half_len(thin), 1e-6) for v in thin]
    k = max(range(3), key=lambda i: n[i])
    beyond = (abs(c[k]) >= 2390) if k < 2 else (c[2] <= 10 or c[2] >= 4790)
    shell = n[k] > 0.95 and beyond and ext[1] >= 300
    boxes.append(dict(c=R2(c), a=[R2(a) for a in p["axes"]], v=p["visible"], s=1 if shell else 0,
                      g=1 if "USStage2Gameplay" in p.get("tags", []) else 0))

seams = {}
for p in P:
    if p["class"] == "US_GravitySeam":
        s = seams.setdefault(p["actor"], [])
        s.append(p["center"])
seams = [dict(name=k, center=R2([sum(c[i] for c in v) / len(v) for i in range(3)])) for k, v in sorted(seams.items())]


def actors(pred):
    seen = {}
    for p in P:
        if pred(p) and p["actor"] not in seen:
            seen[p["actor"]] = R2(p["center"])
    return [dict(name=k, at=v) for k, v in sorted(seen.items())]


artifacts = actors(lambda p: p["class"] == "BP_Artifact_Pickup_C")
for a in artifacts:
    a["inCube"] = abs(a["at"][1]) < 3000
data = dict(
    source="Level_02 geometry dump (%s), map %s" % (dump.replace("\\", "/"), d["map"]),
    half=2400, zones=zones, boxes=boxes, seams=seams, artifacts=artifacts,
    swords=actors(lambda p: p["class"] == "US_TrialSwitch" and "Sword" in p["actor"]),
    guards=actors(lambda p: p["class"] == "BP_Minion_C" and inside(p)),
    shelves=actors(lambda p: p["class"] == "US_Stage2RollingShelf"),
    core=actors(lambda p: "CoreSlider" in p["actor"]),
)
with open(out, "w", encoding="utf-8") as f:
    json.dump(data, f, separators=(",", ":"))
print("cube: %d zones, %d boxes (%d shell, +%d face slabs), %d seams, %d artifacts, %d swords, %d guards" % (
    len(zones), len(boxes), sum(b["s"] for b in boxes), slabs, len(seams), len(artifacts), len(data["swords"]), len(data["guards"])))
