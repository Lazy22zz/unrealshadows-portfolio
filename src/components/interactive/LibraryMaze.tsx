import { useEffect, useMemo, useState, type ReactElement } from "react";
import data from "../../data/library-maze.json";

// The ceiling-face library maze. Geometry, the 8 shelf configurations, the shelf tops reachable from the landing pad,
// the floor's connected regions and the solution all come from the game repo's LibraryMazeLayout.py
// (exported by scripts/sync/export_library_maze.py). Coordinates: cx = world x (east), cy = -world y (north = up).

type Rect = [number, number, number, number]; // x0, x1, y0, y1
type Piece = { rect: Rect; solid: boolean; para: string; drops: string };
type Shelf = { stops: { a: Rect; b: Rect }; lane: Rect; crank: string; para: string };
type Cfg = { lit: string[]; lift: boolean; floorGrid: string[]; regions: Record<string, number> };
const D = data as unknown as {
  half: number; step: number; ncell: number;
  pieces: Record<string, Piece>; low: Record<string, Rect>; seals: Record<string, Rect>; fences: Record<string, Rect>;
  lift: Rect; shelves: Record<string, Shelf>; order: string[]; startCfg: string;
  stations: Record<string, { at: [number, number]; stand: [number, number]; kind: string }>;
  divide: string[]; states: number; minTurns: number; orders: string[][];
  fastest: { order: string[]; seconds: number; walk: { layer: string; node: string; cfg: string; x: number; y: number }[] };
  configs: Record<string, Cfg>;
};
const H = D.half;
const COL: Record<string, string> = { K1: "#2fb3aa", K2: "#d99a3a", K3: "#9a76d0" };
const MARK: Record<string, string> = { K1: "quill", K2: "ink bottle", K3: "candle" };
const W_TO_K: Record<string, string> = Object.fromEntries(Object.entries(D.shelves).map(([k, s]) => [s.crank, k]));

const r2 = (r: Rect) => ({ x: r[0], y: r[2], w: r[1] - r[0], h: r[3] - r[2] });

function regionAt(cfg: Cfg, p: [number, number]): string {
  const i = Math.round((p[0] + H) / D.step), j = Math.round((p[1] + H) / D.step);
  return cfg.floorGrid[j]?.[i] ?? ".";
}

function FloorLayer({ cfg, swordReg, artReg }: { cfg: Cfg; swordReg: string; artReg: string }) {
  const runs: ReactElement[] = [];
  cfg.floorGrid.forEach((row, j) => {
    let i = 0;
    while (i < row.length) {
      const c = row[i];
      let k = i;
      while (k < row.length && row[k] === c) k++;
      if (c !== ".") {
        const fill = c === swordReg ? "rgba(217,154,58,0.30)" : c === artReg ? "rgba(95,167,181,0.30)" : "rgba(194,73,60,0.45)";
        runs.push(<rect key={`${j}-${i}`} x={-H + i * D.step - D.step / 2} y={-H + j * D.step - D.step / 2} width={(k - i) * D.step} height={D.step} fill={fill} />);
      }
      i = k;
    }
  });
  return <g shapeRendering="crispEdges">{runs}</g>;
}

export default function LibraryMaze() {
  const [cfg, setCfg] = useState(D.startCfg);
  const [layer, setLayer] = useState<"top" | "floor">("top");
  const [walkI, setWalkI] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [turns, setTurns] = useState(0);
  const c = D.configs[cfg];
  const lit = new Set(c.lit);
  const goalReachable = lit.has("G");
  const swordReg = regionAt(c, D.stations.W1.stand);
  const artReg = regionAt(c, D.stations.W3.stand);

  const turn = (w: string) => {
    const k = W_TO_K[w];
    const i = D.order.indexOf(k);
    setPlaying(false); setWalkI(-1);
    setCfg((cur) => cur.slice(0, i) + (cur[i] === "a" ? "b" : "a") + cur.slice(i + 1));
    setTurns((t) => t + 1);
  };

  useEffect(() => {
    if (walkI < 0) return;
    const w = D.fastest.walk[walkI];
    setCfg(w.cfg);
    setLayer(w.layer === "top" ? "top" : "floor");
  }, [walkI]);
  useEffect(() => {
    if (!playing) return;
    if (walkI >= D.fastest.walk.length - 1) { setPlaying(false); return; }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => setWalkI((i) => i + 1), reduce ? 200 : 700);
    return () => window.clearTimeout(t);
  }, [playing, walkI]);

  const walkSoFar = walkI >= 0 ? D.fastest.walk.slice(0, walkI + 1) : [];
  const winchesTurned = useMemo(() => {
    const out: string[] = [];
    for (let i = 1; i < walkSoFar.length; i++) {
      if (walkSoFar[i].cfg !== walkSoFar[i - 1].cfg) {
        const k = D.order[[...walkSoFar[i].cfg].findIndex((ch, n) => ch !== walkSoFar[i - 1].cfg[n])];
        out.push(D.shelves[k].crank);
      }
    }
    return out;
  }, [walkI]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="demo">
      <div className="demo-bar">
        <div className="btn-row">
          {["W1", "W2", "W3"].map((w) => {
            const k = W_TO_K[w];
            return (
              <button key={w} className="btn" onClick={() => turn(w)} style={{ borderColor: COL[k] }}>
                <span className="dot" style={{ background: COL[k] }} /> Turn {w} → {k} to stop {cfg[D.order.indexOf(k)] === "a" ? "b" : "a"}
              </button>
            );
          })}
          <button className="btn" onClick={() => { setCfg(D.startCfg); setTurns(0); setWalkI(-1); setPlaying(false); }}>Reset</button>
        </div>
        <div className="btn-row" role="tablist" aria-label="Layer">
          <button className="btn" role="tab" aria-selected={layer === "top"} aria-pressed={layer === "top"} onClick={() => setLayer("top")}>Shelf tops (5 m)</button>
          <button className="btn" role="tab" aria-selected={layer === "floor"} aria-pressed={layer === "floor"} onClick={() => setLayer("floor")}>Floor</button>
        </div>
      </div>
      <div className="demo-body lm-grid">
        <svg viewBox={`${-H - 60} ${-H - 60} ${2 * H + 120} ${2 * H + 120}`} width="100%" role="img" className="lm-svg"
          aria-label={`Library maze, shelves ${cfg}. ${goalReachable ? "The goal is reachable along the tops." : "The goal is not reachable along the tops."}`}>
          <rect x={-H} y={-H} width={2 * H} height={2 * H} fill="#120d0a" stroke="#50412f" strokeWidth={12} />
          {layer === "floor" && <FloorLayer cfg={c} swordReg={swordReg} artReg={artReg} />}
          {/* rails */}
          {Object.entries(D.shelves).map(([k, s]) => {
            const r = r2(s.lane);
            return <rect key={"lane" + k} x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke={COL[k]} strokeOpacity={0.5} strokeWidth={10} strokeDasharray="40 30" />;
          })}
          {/* static pieces */}
          {Object.entries(D.pieces).map(([n, p]) => {
            const r = r2(p.rect);
            const isDivide = D.divide.includes(n);
            const on = layer === "top" && lit.has(n);
            const fill = n === "G" ? "#3a2c18" : n === "Pad" ? "#3d3424" : !p.solid ? "rgba(233,223,194,0.10)" : isDivide ? "#5d4126" : "#4a3624";
            return (
              <g key={n}>
                <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={layer === "floor" && !p.solid ? "none" : fill}
                  stroke={on ? "#f0c66a" : isDivide ? "#a5814a" : "#2a1f15"} strokeWidth={on ? 22 : 10} strokeDasharray={!p.solid ? "30 20" : undefined}>
                  <title>{`${n}${isDivide ? " (the dividing shelf)" : ""}${!p.solid ? " — deck over an aisle" : ""}${on ? " — reachable from the landing" : ""}`}</title>
                </rect>
                {on && <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="rgba(240,198,106,0.22)" pointerEvents="none" />}
              </g>
            );
          })}
          {Object.entries({ ...D.low, ...D.seals }).map(([n, rr]) => {
            const r = r2(rr);
            return <rect key={n} x={r.x} y={r.y} width={r.w} height={r.h} fill="#2c241b" stroke="#2a1f15" strokeWidth={8}><title>{`${n} — low case (bodies only)`}</title></rect>;
          })}
          {/* rolling shelves: the other stop as a ghost, the case itself sliding */}
          {Object.entries(D.shelves).map(([k, s]) => {
            const at = cfg[D.order.indexOf(k)] as "a" | "b";
            const other = at === "a" ? "b" : "a";
            const a = r2(s.stops.a), cur = r2(s.stops[at]), o = r2(s.stops[other]);
            const on = layer === "top" && lit.has(k);
            return (
              <g key={k}>
                <rect x={o.x} y={o.y} width={o.w} height={o.h} fill="none" stroke={COL[k]} strokeOpacity={0.45} strokeWidth={12} strokeDasharray="24 18" />
                <g style={{ transform: `translate(${cur.x - a.x}px, ${cur.y - a.y}px)`, transition: "transform 1.2s cubic-bezier(.45,0,.25,1)" }}>
                  <rect x={a.x} y={a.y} width={a.w} height={a.h} fill={COL[k]} fillOpacity={on ? 0.85 : 0.55} stroke={on ? "#f0c66a" : "#0d0907"} strokeWidth={on ? 24 : 12}>
                    <title>{`${k} (${MARK[k]} marker) at stop ${at}; winch ${s.crank}`}</title>
                  </rect>
                  <text x={a.x + a.w / 2} y={a.y + a.h / 2 + 40} textAnchor="middle" fontSize={120} fontWeight={700} fill="#0d0907">{k}</text>
                </g>
              </g>
            );
          })}
          <rect x={D.lift[0]} y={D.lift[2]} width={D.lift[1] - D.lift[0]} height={D.lift[3] - D.lift[2]} fill="none" stroke="#7fae6a" strokeWidth={14} strokeDasharray="20 14"><title>Lift case (unlocked by the first turn of W3)</title></rect>
          {/* winches */}
          {Object.entries(D.stations).map(([w, st]) => (
            <g key={w} onClick={() => W_TO_K[w] && turn(w)} style={{ cursor: W_TO_K[w] ? "pointer" : "default" }}>
              <circle cx={st.at[0]} cy={st.at[1]} r={70} fill={W_TO_K[w] ? COL[W_TO_K[w]] : "#7fae6a"} stroke="#0d0907" strokeWidth={14} />
              <text x={st.at[0]} y={st.at[1] - 95} textAnchor="middle" fontSize={110} fontWeight={700} fill="#ece2cb" stroke="#0d0907" strokeWidth={18} paintOrder="stroke">{w}</text>
              <title>{w === "WL" ? "Lift winch" : `Winch ${w}: moves ${W_TO_K[w]}`}</title>
            </g>
          ))}
          {/* labels */}
          <text x={(D.pieces.Pad.rect[0] + D.pieces.Pad.rect[1]) / 2} y={D.pieces.Pad.rect[2] - 40} textAnchor="middle" fontSize={110} fill="#ece2cb">landing</text>
          <text x={(D.pieces.G.rect[0] + D.pieces.G.rect[1]) / 2} y={D.pieces.G.rect[3] + 140} textAnchor="middle" fontSize={110} fill="#f0c66a">sword well</text>
          <text x={-H + 40} y={-H + 140} fontSize={110} fill="#5fa7b5" opacity={0.8}>artifact side (north)</text>
          <text x={-H + 40} y={H - 60} fontSize={110} fill="#d99a3a" opacity={0.8}>sword side (south)</text>
          {/* solution walk */}
          {walkSoFar.length > 1 && (
            <polyline points={walkSoFar.map((w) => `${w.x},${w.y}`).join(" ")} fill="none" stroke="#fff6d8" strokeWidth={22} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
          )}
          {walkI >= 0 && (
            <circle cx={D.fastest.walk[walkI].x} cy={D.fastest.walk[walkI].y} r={80} fill={D.fastest.walk[walkI].layer === "top" ? "#f0c66a" : "#ece2cb"} stroke="#0d0907" strokeWidth={14} className="lm-pulse" />
          )}
        </svg>
        <aside>
          <div className="eyebrow">Configuration</div>
          <div className="lm-cfg">
            {D.order.map((k, i) => (
              <span key={k} className="pill" style={{ color: COL[k], borderColor: COL[k] }}>{k}: stop {cfg[i]}</span>
            ))}
          </div>
          <div className="card" style={{ marginTop: 12, padding: "12px 14px" }}>
            {layer === "top" ? (
              <>
                <strong className={goalReachable ? "gilt" : ""}>{goalReachable ? "The sword well is reachable along the tops." : "No top route from the landing to the sword well."}</strong>
                <div className="small muted">{c.lit.length} shelf tops reachable from the landing without touching the floor (gold outline).</div>
              </>
            ) : (
              <>
                <strong>Floor regions</strong>
                <div className="small muted">
                  Every shelf position keeps the floor split in two: <span style={{ color: "#d99a3a" }}>sword side</span> and{" "}
                  <span style={{ color: "#5fa7b5" }}>artifact side</span>. Red cells are small closed pockets.
                </div>
              </>
            )}
          </div>
          <div className="eyebrow" style={{ marginTop: 16 }}>Solver</div>
          <p className="small muted" style={{ marginTop: 6 }}>
            {D.states.toLocaleString()} states. Fewest winch turns from the landing: <b className="gilt">{D.minTurns}</b>. Orders:{" "}
            {D.orders.map((o) => o.join(" → ")).join(" or ")}. You have turned {turns}.
          </p>
          <div className="btn-row">
            <button className="btn primary" onClick={() => { if (walkI >= D.fastest.walk.length - 1) setWalkI(-1); setPlaying((p) => !p); if (walkI < 0) setWalkI(0); }} aria-pressed={playing}>
              {playing ? "Pause" : walkI >= 0 ? "Resume solution" : "Play solution"}
            </button>
            <button className="btn" onClick={() => { setPlaying(false); setWalkI((i) => Math.max(0, i - 1)); }} aria-label="Previous step">◀</button>
            <button className="btn" onClick={() => { setPlaying(false); setWalkI((i) => Math.min(D.fastest.walk.length - 1, i + 1)); }} aria-label="Next step">▶</button>
          </div>
          {walkI >= 0 && (
            <p className="small" style={{ marginTop: 10 }}>
              Step {walkI + 1}/{D.fastest.walk.length}: on the <b>{D.fastest.walk[walkI].layer === "top" ? "shelf tops" : "floor"}</b> at <code>{D.fastest.walk[walkI].node}</code>.
              {winchesTurned.length > 0 && <> Winches so far: {winchesTurned.join(" → ")}.</>}
            </p>
          )}
          <div className="legend" style={{ marginTop: 12 }}>
            <span><i className="sw" style={{ background: "#4a3624" }} /> 5 m case</span>
            <span><i className="sw" style={{ background: "#5d4126" }} /> dividing shelf</span>
            <span><i className="sw" style={{ background: "#2c241b" }} /> low case</span>
            <span><i className="sw" style={{ background: "transparent", borderStyle: "dashed" }} /> deck over aisle</span>
          </div>
        </aside>
      </div>
      <div className="demo-foot">
        Data: <code>LibraryMazeLayout.py</code> (its own <code>verify()</code> passes before export). Reachable tops assume the lift is unlocked exactly when K3 stands at b, as in the design sheet.
        Fastest solution: {D.fastest.order.join(" → ")}, {D.fastest.seconds} s of movement plus flight and drawing the sword.
      </div>
      <style>{`
        .lm-grid { display: grid; grid-template-columns: minmax(0, 1.9fr) minmax(230px, 1fr); gap: 18px; }
        @media (max-width: 860px) { .lm-grid { grid-template-columns: 1fr; } }
        .lm-svg { background: #0f0b08; border-radius: 10px; border: 1px solid var(--line); }
        .lm-cfg { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
        .lm-pulse { animation: lmp 1.4s ease-in-out infinite; }
        @keyframes lmp { 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
}
