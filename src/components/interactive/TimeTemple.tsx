import { useEffect, useMemo, useState } from "react";
import data from "../../data/temple.json";

// The Time Temple (TRIA TEMPORA V9.x): three versions of one 42 x 42 m temple, one per era, joined only by three
// two-era junctions. Everything drawn here comes from src/data/temple.json, exported from the game repo's
// TempleV9Space.py (places, paths, masses) and TempleV9Layout.py (the solver's fastest solo route).

type Place = { x: number; y: number; z: number; era: number; label: string };
type Path = { a: string; b: string; kind: string; era: number; oneway: boolean; keys: string[]; door: string | null; name: string | null };
type Mass = { id: string; eras: number[]; kind: string; poly: number[][]; z0: number; z1: number; note: string };
type Step = { type: string; junction?: string; frm?: string; to?: string; what?: string; kind?: string; a?: string; b?: string };

const D = data as unknown as {
  places: Record<string, Place>; paths: Path[]; masses: Mass[]; well: number[][]; sunken: number[][];
  junctions: Record<string, [string, string]>; moments: Record<string, { place: string; name: string }>;
  fragments: Record<string, { place: string; name: string }>; start: string; goal: string;
  solo: { seconds: number; steps: Step[]; places: string[] }; soloStates: number; soloDeadStates: number;
  crypt: { floor: number; rect: number[] };
};

const ERAS = [
  { id: 0, key: "P", name: "Past", color: "var(--past)", hex: "#d79a4a", blurb: "The temple intact: a climb from the flooded cistern to the crown, two ways up." },
  { id: 1, key: "N", name: "Present", color: "var(--present)", hex: "#5fa7b5", blurb: "The ruin as it stands: a broken pier with a spiral stair, a shaft drop and a chained climb." },
  { id: 2, key: "F", name: "Future", color: "var(--future)", hex: "#9a82d6", blurb: "Collapse: a broken span, rubble mounds and one-way falls down to the well floor." },
];
const ALL_KEYS = [...Object.keys(D.moments), ...Object.keys(D.fragments)];
const KEY_LABEL: Record<string, string> = Object.fromEntries([
  ...Object.entries(D.moments).map(([k, v]) => [k, v.name]),
  ...Object.entries(D.fragments).map(([k, v]) => [k, v.name]),
]);
const KEY_AT: Record<string, string> = Object.fromEntries([
  ...Object.entries(D.moments).map(([k, v]) => [v.place, k]),
  ...Object.entries(D.fragments).map(([k, v]) => [v.place, k]),
]);
const JUNC_AT: Record<string, { j: string; other: string }> = {};
for (const [j, [u, v]] of Object.entries(D.junctions)) {
  JUNC_AT[u] = { j, other: v };
  JUNC_AT[v] = { j, other: u };
}

const Y = (y: number) => 42 - y;
const zColor = (z: number) => {
  const t = Math.max(0, Math.min(1, (z + 7) / 23));
  const stops = [[90, 110, 190], [70, 170, 170], [200, 180, 90], [240, 200, 120]];
  const f = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(f)), u = f - i;
  const c = stops[i].map((a, k) => Math.round(a + (stops[i + 1][k] - a) * u));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};
const DASH: Record<string, string | undefined> = { tunnel: "0.6 0.4", drop: "0.25 0.35", shaft: "0.25 0.35", ladder: "0.15 0.25", lift: "1 0.3" };

/** Places reachable from the start with a fixed set of keys (doors open once their push side is reached). */
function reachable(keys: Set<string>): Set<string> {
  const seen = new Set([D.start]);
  const q = [D.start];
  const ok = (p: Path) => p.keys.every((k) => keys.has(k));
  while (q.length) {
    const n = q.shift()!;
    const next: string[] = [];
    for (const p of D.paths) {
      if (!ok(p)) continue;
      if (p.a === n && (!p.door || p.door === n || seen.has(p.door))) next.push(p.b);
      if (p.b === n && !p.oneway && (!p.door || p.door === n || seen.has(p.door))) next.push(p.a);
    }
    if (JUNC_AT[n]) next.push(JUNC_AT[n].other);
    for (const m of next) if (!seen.has(m)) { seen.add(m); q.push(m); }
  }
  return seen;
}

function stepText(s: Step): string {
  if (s.type === "switch") return `Junction ${s.junction}: ${ERAS.find((e) => e.key === s.frm)!.name} → ${ERAS.find((e) => e.key === s.to)!.name}`;
  if (s.type === "pull") return `Take ${KEY_LABEL[s.what!] ?? s.what}`;
  if (s.type === "open") return `Push open: ${s.what}`;
  return `${s.kind} → ${D.places[s.b!]?.label ?? s.b}`;
}

export default function TimeTemple() {
  const [era, setEra] = useState(0);
  const [ghosts, setGhosts] = useState(true);
  const [held, setHeld] = useState<Set<string>>(new Set());
  const [pick, setPick] = useState<string | null>(null);
  const [stepI, setStepI] = useState(-1); // -1 = not playing the route
  const [playing, setPlaying] = useState(false);

  // route playback state derived from the step index
  const route = useMemo(() => {
    let at = D.start;
    const keys = new Set<string>();
    const trail: { a: string; b: string }[] = [];
    let e = 0;
    for (let i = 0; i <= stepI && i < D.solo.steps.length; i++) {
      const s = D.solo.steps[i];
      if (s.type === "move") { trail.push({ a: s.a!, b: s.b! }); at = s.b!; }
      else if (s.type === "switch") { at = JUNC_AT[at]?.other ?? at; }
      else if (s.type === "pull") keys.add(s.what!);
      e = D.places[at].era;
    }
    return { at, keys, trail, era: stepI < 0 ? -1 : e };
  }, [stepI]);

  useEffect(() => { if (route.era >= 0) setEra(route.era); }, [route.era]);
  useEffect(() => {
    if (!playing) return;
    if (stepI >= D.solo.steps.length - 1) { setPlaying(false); return; }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => setStepI((i) => i + 1), reduce ? 200 : 650);
    return () => window.clearTimeout(t);
  }, [playing, stepI]);

  const keys = stepI >= 0 ? route.keys : held;
  const reach = useMemo(() => reachable(keys), [keys]);
  const eraInfo = ERAS[era];
  const masses = D.masses.filter((m) => m.eras.includes(era));
  const ghostMasses = ghosts ? D.masses.filter((m) => !m.eras.includes(era) && m.eras.length === 1) : [];
  const paths = D.paths.filter((p) => p.era === era);
  const places = Object.entries(D.places).filter(([, p]) => p.era === era);
  const countReach = (e: number) => Object.entries(D.places).filter(([k, p]) => p.era === e && reach.has(k)).length;
  const countAll = (e: number) => Object.values(D.places).filter((p) => p.era === e).length;
  const pickInfo = pick ? D.places[pick] : null;
  const curStep = stepI >= 0 ? D.solo.steps[stepI] : null;

  const toggleKey = (k: string) => {
    setStepI(-1); setPlaying(false);
    setHeld((h) => { const n = new Set(h); n.has(k) ? n.delete(k) : n.add(k); return n; });
  };

  return (
    <div className="demo">
      <div className="demo-bar">
        <div className="btn-row" role="tablist" aria-label="Era">
          {ERAS.map((e) => (
            <button key={e.id} role="tab" aria-selected={era === e.id} className="btn" aria-pressed={era === e.id}
              onClick={() => setEra(e.id)} style={era === e.id ? { borderColor: e.hex, color: e.hex } : undefined}>
              <span className="dot" style={{ background: e.hex }} /> {e.name}
              <span className="small muted">{countReach(e.id)}/{countAll(e.id)}</span>
            </button>
          ))}
          <label className="small muted" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 6 }}>
            <input type="checkbox" checked={ghosts} onChange={(e) => setGhosts(e.target.checked)} /> other-era ghosts
          </label>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={() => { if (stepI >= D.solo.steps.length - 1) setStepI(-1); setPlaying((p) => !p); }} aria-pressed={playing}>
            {playing ? "Pause route" : stepI >= 0 ? "Resume route" : "Play fastest solo route"}
          </button>
          <button className="btn" onClick={() => { setPlaying(false); setStepI((i) => Math.max(-1, i - 1)); }} aria-label="Previous step">◀</button>
          <button className="btn" onClick={() => { setPlaying(false); setStepI((i) => Math.min(D.solo.steps.length - 1, i + 1)); }} aria-label="Next step">▶</button>
          <button className="btn" onClick={() => { setPlaying(false); setStepI(-1); }}>Reset</button>
        </div>
      </div>
      <div className="demo-body tt-grid">
        <svg viewBox="-2 -2 46 46" width="100%" role="img" aria-label={`${eraInfo.name} era plan of the temple`} className="tt-svg">
          <rect x={0} y={0} width={42} height={42} fill="#140f0b" stroke="#3a2f25" strokeWidth={0.12} />
          {Array.from({ length: 7 }, (_, i) => (
            <g key={i} stroke="#221a13" strokeWidth={0.05}>
              <line x1={i * 7} y1={0} x2={i * 7} y2={42} /><line x1={0} y1={i * 7} x2={42} y2={i * 7} />
            </g>
          ))}
          <polygon points={D.sunken.map(([x, y]) => `${x},${Y(y)}`).join(" ")} fill="rgba(80,110,160,0.08)" stroke="rgba(120,150,200,0.25)" strokeWidth={0.1} />
          {ghostMasses.map((m) => (
            <polygon key={"g" + m.id} points={m.poly.map(([x, y]) => `${x},${Y(y)}`).join(" ")} fill="none" stroke={ERAS[m.eras[0]].hex} strokeOpacity={0.35} strokeWidth={0.1} strokeDasharray="0.3 0.3" />
          ))}
          {masses.map((m) => (
            <polygon key={m.id} points={m.poly.map(([x, y]) => `${x},${Y(y)}`).join(" ")}
              fill={m.kind === "pier" ? "rgba(217,178,94,0.22)" : m.kind === "rubble" ? "rgba(140,110,80,0.25)" : "rgba(120,100,80,0.22)"}
              stroke="rgba(217,178,94,0.35)" strokeWidth={0.08}><title>{`${m.id}: ${m.note} (z ${m.z0}..${m.z1} m)`}</title></polygon>
          ))}
          <polygon points={D.well.map(([x, y]) => `${x},${Y(y)}`).join(" ")} fill="none" stroke={eraInfo.hex} strokeOpacity={0.5} strokeWidth={0.12} strokeDasharray="0.6 0.4" />
          <rect x={D.crypt.rect[0]} y={Y(D.crypt.rect[3])} width={D.crypt.rect[2] - D.crypt.rect[0]} height={D.crypt.rect[3] - D.crypt.rect[1]}
            fill="none" stroke={era === 0 ? "#f0c66a" : "transparent"} strokeWidth={0.1} strokeDasharray="0.2 0.2" />
          {paths.map((p, i) => {
            const A = D.places[p.a], B = D.places[p.b];
            const locked = !p.keys.every((k) => keys.has(k));
            const dim = !(reach.has(p.a) || reach.has(p.b));
            const mid = [(A.x + B.x) / 2, (Y(A.y) + Y(B.y)) / 2];
            return (
              <g key={i} opacity={dim ? 0.3 : 1}>
                <line x1={A.x} y1={Y(A.y)} x2={B.x} y2={Y(B.y)} stroke={locked ? "#6b2e26" : zColor((A.z + B.z) / 2)}
                  strokeWidth={p.kind === "ledge" ? 0.35 : 0.5} strokeLinecap="round" strokeDasharray={DASH[p.kind]}>
                  <title>{`${p.kind}${p.name ? ` — ${p.name}` : ""}: ${A.label} (z ${A.z}) ↔ ${B.label} (z ${B.z})${p.oneway ? " · one way" : ""}${p.keys.length ? ` · needs ${p.keys.map((k) => KEY_LABEL[k]).join(", ")}` : ""}`}</title>
                </line>
                {p.oneway && (
                  <polygon points="0,-0.55 0.9,0 0,0.55" fill="#ece2cb" opacity={0.85}
                    transform={`translate(${mid[0]},${mid[1]}) rotate(${(Math.atan2(Y(B.y) - Y(A.y), B.x - A.x) * 180) / Math.PI})`} />
                )}
                {p.keys.length > 0 && (
                  <g transform={`translate(${mid[0]},${mid[1]})`}>
                    <rect x={-0.7} y={-0.55} width={1.4} height={1.1} rx={0.2} fill={locked ? "#c2493c" : "#7fae6a"} />
                    <path d={locked ? "M -0.35 -0.55 v -0.3 a 0.35 0.35 0 0 1 0.7 0 v 0.3" : "M -0.35 -0.55 v -0.3 a 0.35 0.35 0 0 1 0.7 0"} fill="none" stroke={locked ? "#c2493c" : "#7fae6a"} strokeWidth={0.18} />
                  </g>
                )}
              </g>
            );
          })}
          {route.trail.filter((t) => D.places[t.a].era === era && D.places[t.b].era === era).map((t, i) => (
            <line key={"r" + i} x1={D.places[t.a].x} y1={Y(D.places[t.a].y)} x2={D.places[t.b].x} y2={Y(D.places[t.b].y)}
              stroke="#fff6d8" strokeWidth={0.22} strokeLinecap="round" className="tt-trail" />
          ))}
          {places.map(([id, p]) => {
            const isJ = JUNC_AT[id], key = KEY_AT[id], isGoal = id === D.goal, isStart = id === D.start;
            const r = reach.has(id);
            return (
              <g key={id} onClick={() => setPick(id)} style={{ cursor: "pointer" }} opacity={r ? 1 : 0.35}>
                {isJ && <circle cx={p.x} cy={Y(p.y)} r={1.5} fill="none" stroke={ERAS[D.places[isJ.other].era].hex} strokeWidth={0.28} className="tt-pulse" />}
                {key && (key.startsWith("FRAG")
                  ? <rect x={p.x - 0.65} y={Y(p.y) - 0.65} width={1.3} height={1.3} transform={`rotate(45 ${p.x} ${Y(p.y)})`} fill={keys.has(key) ? "#7fae6a" : "#c9a24e"} stroke="#140f0b" strokeWidth={0.12} />
                  : <path d={`M ${p.x - 0.75} ${Y(p.y) - 0.9} h 1.5 l -1.5 1.8 h 1.5 z`} fill={keys.has(key) ? "#7fae6a" : "#f0d48f"} stroke="#140f0b" strokeWidth={0.12} />)}
                {!key && <circle cx={p.x} cy={Y(p.y)} r={isGoal || isStart ? 0.75 : 0.42} fill={isGoal ? "#f0c66a" : isStart ? "#ece2cb" : zColor(p.z)} stroke="#140f0b" strokeWidth={0.1} />}
                {isJ && <text x={p.x + 1.7} y={Y(p.y) + 0.5} fontSize={1.5} fill={ERAS[D.places[isJ.other].era].hex} fontWeight={700}>{isJ.j}</text>}
                <title>{`${p.label} — z ${p.z} m${isJ ? ` · junction ${isJ.j} to the ${ERAS[D.places[isJ.other].era].name.toLowerCase()}` : ""}${key ? ` · ${KEY_LABEL[key]}` : ""}`}</title>
              </g>
            );
          })}
          {stepI >= 0 && D.places[route.at].era === era && (
            <circle cx={D.places[route.at].x} cy={Y(D.places[route.at].y)} r={1.1} fill="none" stroke="#fff" strokeWidth={0.3} className="tt-pulse" />
          )}
          <text x={0.4} y={43.4} fontSize={1.2} fill="#7a6c58">0</text>
          <text x={40} y={43.4} fontSize={1.2} fill="#7a6c58">42 m</text>
          <text x={43} y={1.5} fontSize={1.3} fill="#7a6c58">N</text>
        </svg>

        <aside className="tt-side">
          <div className="eyebrow" style={{ color: eraInfo.hex }}>{eraInfo.name} era</div>
          <p className="small muted" style={{ marginTop: 6 }}>{eraInfo.blurb}</p>
          {stepI >= 0 ? (
            <div className="card tt-card">
              <div className="small muted">Step {stepI + 1} / {D.solo.steps.length}</div>
              <strong>{curStep && stepText(curStep)}</strong>
              <div className="small muted" style={{ marginTop: 6 }}>Solver's fastest solo route: {D.solo.seconds} s of movement.</div>
            </div>
          ) : pickInfo ? (
            <div className="card tt-card">
              <strong>{pickInfo.label}</strong>
              <div className="small muted">z {pickInfo.z} m · {reach.has(pick!) ? "reachable with the current keys" : "not reachable with the current keys"}</div>
              {JUNC_AT[pick!] && <div className="small">Junction {JUNC_AT[pick!].j}: step through to the {ERAS[D.places[JUNC_AT[pick!].other].era].name.toLowerCase()} at the same spot.</div>}
              {KEY_AT[pick!] && <div className="small">Collect here: {KEY_LABEL[KEY_AT[pick!]]}</div>}
            </div>
          ) : (
            <p className="small muted">Click a place for details. Toggle keys below to see how they change what is reachable.</p>
          )}
          <div className="eyebrow" style={{ marginTop: 14 }}>Keys held {stepI >= 0 && <span className="muted">(route)</span>}</div>
          <div className="tt-keys">
            {ALL_KEYS.map((k) => (
              <button key={k} className="btn" aria-pressed={keys.has(k)} onClick={() => toggleKey(k)} title={`Found at: ${D.places[(D.moments as any)[k]?.place ?? (D.fragments as any)[k].place].label}`}>
                {k.startsWith("FRAG") ? "◆" : "⧗"} {KEY_LABEL[k]}
              </button>
            ))}
          </div>
          <div className="legend" style={{ marginTop: 14 }}>
            <span><i className="sw" style={{ background: zColor(-6) }} /> low</span>
            <span><i className="sw" style={{ background: zColor(5) }} /> mid</span>
            <span><i className="sw" style={{ background: zColor(15) }} /> high</span>
            <span>⧗ time moment</span><span>◆ fragment</span><span>▶ one-way</span>
            <span><i className="sw" style={{ background: "#c2493c" }} /> locked</span>
          </div>
        </aside>
      </div>
      <div className="demo-foot">
        Data: <code>TempleV9Space.py</code> / <code>TempleV9Layout.py</code> in the game repo — {Object.keys(D.places).length} places, {D.paths.length} paths;
        the solver explores {D.soloStates.toLocaleString()} solo states with {D.soloDeadStates} soft-locks. Plan view, north up; colour = height.
      </div>
      <style>{`
        .tt-grid { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(240px, 1fr); gap: 18px; }
        @media (max-width: 860px) { .tt-grid { grid-template-columns: 1fr; } }
        .tt-svg { background: #0f0b08; border-radius: 10px; border: 1px solid var(--line); }
        .tt-card { padding: 12px 14px; margin-top: 8px; }
        .tt-keys { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
        .tt-keys .btn { padding: 6px 9px; font-size: 0.78rem; }
        .tt-pulse { animation: ttp 1.8s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
        @keyframes ttp { 50% { opacity: 0.35; } }
        .tt-trail { filter: drop-shadow(0 0 0.4px #fff6d8); }
      `}</style>
    </div>
  );
}
