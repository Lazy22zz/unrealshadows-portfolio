"""Export the ceiling-face Library Maze (rolling shelves) for the website.

Imports the game repo's LibraryMazeLayout.py (pure Python, no unreal) and asks its own solver for:
  - the static pieces, the three rolling cases and their two stops, winch stations;
  - for each of the 8 shelf configurations: which shelf tops are reachable from the landing pad without touching
    the floor, and the floor's connected regions on its 40 cm grid;
  - the fewest-winch-turn orders and the fastest path for the canonical order.
Fails (exit 1) if the module's own verify() reports a failed check.
Usage: python export_library_maze.py <game repo> <out.json>
"""
import io
import json
import os
import sys
from contextlib import redirect_stdout

repo, out = sys.argv[1], sys.argv[2]
sys.path.insert(0, os.path.join(repo, "Source", "UnrealShadows_LOTL", "Tools", "Stage2", "LibraryMaze"))
import LibraryMazeLayout as M  # noqa: E402

buf = io.StringIO()
with redirect_stdout(buf):
    checks = M.verify()
fails = [c for c in checks if not c[1]] if isinstance(checks, list) and checks and isinstance(checks[0], tuple) else []
print("library maze verify(): %s" % (("%d checks" % len(checks)) if isinstance(checks, list) else "ran"))
if fails:
    print("FAILED checks:", fails[:5])
    sys.exit(1)

m = M.Model()
start = (("T", "Pad"), M.START_CFG, False, False)
reach, edges = M.explore(m, start)
n, _ = M.min_turns(edges, start)
orders = M.minimal_orders(edges, start, n)


def lit(cfg, lift):
    s = (("T", "Pad"), cfg, lift, False)
    seen, todo = {s}, [s]
    while todo:
        u = todo.pop()
        for t, op in m.moves(u):
            if op is None and t not in seen:
                seen.add(t)
                todo.append(t)
    return sorted({t[0][1] for t in seen if t[0][0] == "T"})


configs = {}
for k1 in "ab":
    for k2 in "ab":
        for k3 in "ab":
            cfg = (k1, k2, k3)
            lift = k3 == "b"
            fl = M.floor(cfg)
            # region grid: one char per 40 cm cell, '.' = not free, 'A'.. = region id
            rows = []
            for j in range(M.NCELL + 1):
                rows.append("".join(chr(65 + fl["reg"][(i, j)] % 26) if (i, j) in fl["reg"] else "."
                                    for i in range(M.NCELL + 1)))
            sizes = {}
            for c, r in fl["reg"].items():
                sizes[r] = sizes.get(r, 0) + 1
            big = sorted(sizes, key=lambda r: -sizes[r])
            configs["".join(cfg)] = dict(lit=lit(cfg, lift), lift=lift, floorGrid=rows,
                                         regions={chr(65 + r % 26): sizes[r] for r in big})

order = tuple(orders[0]) if orders else None
secs, path = M.fastest(m, start, order)
walk = []
for s in path:
    (kind, name), cfg = s[0], s[1]
    xy = M._node_xy((kind, name), cfg, m)
    walk.append(dict(layer="top" if kind == "T" else "floor", node=name, cfg="".join(cfg), x=xy[0], y=xy[1]))

data = dict(
    source="Source/UnrealShadows_LOTL/Tools/Stage2/LibraryMaze/LibraryMazeLayout.py",
    half=M.H, step=M.STEP, ncell=M.NCELL,
    frame="ceiling local: cx = world x, cy = -world y; rows run east-west, 2 m deep, 2 m aisles",
    pieces={k: dict(rect=v["rect"], solid=v["solid"], para="".join(sorted(v["para"])), drops="".join(sorted(v["drops"])))
            for k, v in M.PIECES.items()},
    low=M.LOW, seals=M.SEALS, fences=M.FENCES, lift=M.LIFT, window=M.WINDOW,
    shelves={k: dict(stops=v["stops"], lane=v["lane"], crank=v["crank"], para="".join(sorted(v["para"])))
             for k, v in M.SHELVES.items()},
    order=list(M.ORDER), startCfg="".join(M.START_CFG),
    stations={k: dict(at=v["at"], stand=v["stand"], kind=v["kind"]) for k, v in M.STATIONS.items()},
    divide=list(M.DIVIDE), states=len(reach), minTurns=n, orders=[list(o) for o in orders],
    fastest=dict(order=list(order) if order else None, seconds=round(secs, 1) if secs else None, walk=walk),
    configs=configs,
)
with open(out, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
print("library maze: %d states, min %s turns, %d orders, fastest %.1f s, %d walk nodes" % (
    len(reach), n, len(orders), secs or -1, len(walk)))
