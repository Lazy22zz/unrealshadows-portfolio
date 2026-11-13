import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyRotation, buildPuzzle, minMovesToSolve, nextOptimalMove, progress, setClutch, DISC_A, DISC_B,
  type CoinLockState,
} from "../../lib/coinlock";

// Playable copy of Stage 1's two-coin clutch lock. All rules come from src/lib/coinlock.ts (a port of USCoinLock).
// Drawing follows the game's panel: each disc carries one groove from a U-notch inlet to a spout outlet, 180° apart;
// when rot == aim the inlet faces left and the outlet faces right.

const R = 96;
const AX = 250, BX = 560, CY = 170, JX = (AX + BX) / 2;

function seeded(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function Disc({ cx, angle, label, coin, done, seized, selected, onPick }: {
  cx: number; angle: number; label: string; coin: "sun" | "moon"; done: boolean; seized: boolean; selected: boolean; onPick: () => void;
}) {
  const teeth = Array.from({ length: 24 }, (_, i) => i * 15);
  const groove = `M ${-R + 18} 0 C ${-R * 0.35} ${-R * 0.95}, ${R * 0.35} ${R * 0.95}, ${R - 18} 0`;
  return (
    <g onClick={onPick} style={{ cursor: "pointer" }} role="button" aria-label={`Select disc ${label}`}>
      {selected && <circle cx={cx} cy={CY} r={R + 20} fill="none" stroke="#f0d48f" strokeWidth="2" strokeDasharray="6 6" className="cl-sel" />}
      <g style={{ transform: `translate(${cx}px, ${CY}px) rotate(${angle}deg)`, transition: "transform 0.45s cubic-bezier(.34,1.4,.64,1)" }}>
        {teeth.map((t) => (
          <rect key={t} x={-6} y={-R - 12} width={12} height={14} rx={2} fill={seized ? "#6b4a33" : "#8a6a3a"} transform={`rotate(${t})`} />
        ))}
        <circle r={R} fill={seized ? "#3b2a1e" : "#4a3720"} stroke="#d9b25e" strokeWidth="2.5" />
        <circle r={R - 14} fill="#2a1f15" stroke="#6e5530" strokeWidth="1.2" />
        <path d={groove} fill="none" stroke="#0e0a07" strokeWidth="13" strokeLinecap="round" />
        <path d={groove} fill="none" stroke={done ? "#f0c66a" : "#7a5d32"} strokeWidth="5" strokeLinecap="round" />
        {/* inlet U-notch (left) and spout (right) */}
        <path d={`M ${-R + 4} -11 L ${-R + 22} -11 L ${-R + 22} 11 L ${-R + 4} 11`} fill="none" stroke="#f0d48f" strokeWidth="3" />
        <path d={`M ${R - 26} -9 L ${R - 4} 0 L ${R - 26} 9 Z`} fill="#f0d48f" />
        {seized && Array.from({ length: 7 }, (_, i) => (
          <circle key={i} cx={Math.cos(i * 2.1) * (R - 30)} cy={Math.sin(i * 2.1) * (R - 30)} r={5 + (i % 3) * 3} fill="#8c4a2a" opacity="0.55" />
        ))}
      </g>
      {/* coin in the hub does not rotate with the disc so its face stays readable */}
      <circle cx={cx} cy={CY} r={26} fill="#c9a24e" stroke="#f3dc98" strokeWidth="2" />
      {coin === "sun"
        ? <g stroke="#6b4b1d" strokeWidth="2.2">{Array.from({ length: 8 }, (_, i) => (
            <line key={i} x1={cx + Math.cos(i * Math.PI / 4) * 9} y1={CY + Math.sin(i * Math.PI / 4) * 9} x2={cx + Math.cos(i * Math.PI / 4) * 17} y2={CY + Math.sin(i * Math.PI / 4) * 17} />
          ))}<circle cx={cx} cy={CY} r={6} fill="#6b4b1d" /></g>
        : <g><circle cx={cx - 2} cy={CY} r={14} fill="#6b4b1d" /><circle cx={cx + 5} cy={CY - 4} r={12} fill="#c9a24e" /></g>}
      <text x={cx} y={CY + R + 44} textAnchor="middle" fill={selected ? "#f0d48f" : "#aa9b82"} fontSize="15" fontFamily="Cinzel, serif" fontWeight="700">
        {label}{seized ? " · seized" : ""}
      </text>
    </g>
  );
}

function Gear({ x, y, spin, teeth = 10, r = 22 }: { x: number; y: number; spin: number; teeth?: number; r?: number }) {
  return (
    <g style={{ transform: `translate(${x}px, ${y}px)`, transition: "transform 0.4s ease" }}>
      <g style={{ transform: `rotate(${spin}deg)`, transition: "transform 0.45s ease" }}>
        {Array.from({ length: teeth }, (_, i) => (
          <rect key={i} x={-4} y={-r - 7} width={8} height={9} rx={1.5} fill="#9c7a42" transform={`rotate(${(i * 360) / teeth})`} />
        ))}
        <circle r={r} fill="#5a4426" stroke="#d9b25e" strokeWidth="1.8" />
        <line x1={-r + 6} y1={0} x2={r - 6} y2={0} stroke="#2a1f15" strokeWidth="3" />
      </g>
      <circle r={5} fill="#d9b25e" />
    </g>
  );
}

export default function CoinLock() {
  const [seizeB, setSeizeB] = useState(true);
  const [seed, setSeed] = useState(7);
  const initial = useMemo(() => buildPuzzle(seeded(seed), seizeB ? 5 : 3, seizeB), [seed, seizeB]);
  const [s, setS] = useState<CoinLockState>(initial);
  const [sel, setSel] = useState(DISC_A);
  const [moves, setMoves] = useState(0);
  const [msg, setMsg] = useState("Turn the discs until both grooves line up: inlet facing the source, spout facing the gate.");
  const [shake, setShake] = useState(0);
  const [visA, setVisA] = useState(0);
  const [visB, setVisB] = useState(0);
  const [idler, setIdler] = useState(0);
  const [auto, setAuto] = useState(false);
  const optimalAtStart = useMemo(() => minMovesToSolve(initial), [initial]);
  const remaining = minMovesToSolve(s);
  const p = progress(s);
  const root = useRef<HTMLDivElement>(null);

  const reset = useCallback((st: CoinLockState) => {
    setS(st); setMoves(0); setAuto(false);
    setVisA((st.rotA - st.aimA) * 60); setVisB((st.rotB - st.aimB) * 60); setIdler(0);
    setMsg("Turn the discs until both grooves line up: inlet facing the source, spout facing the gate.");
  }, []);
  useEffect(() => reset(initial), [initial, reset]);

  const rotate = useCallback((disc: number, steps: number) => {
    setS((cur) => {
      if (progress(cur).solved) return cur;
      const r = applyRotation(cur, disc, steps);
      if (r.result === "seized") {
        setShake((k) => k + 1);
        setMsg("Disc II is rusted solid. It can only move when the clutch is engaged and disc I drags it — the other way round.");
        return cur;
      }
      if (r.result !== "rotated") return cur;
      const dA = disc === DISC_A ? steps : cur.clutchEngaged ? -steps : 0;
      const dB = disc === DISC_B ? steps : cur.clutchEngaged ? -steps : 0;
      setVisA((v) => v + dA * 60);
      setVisB((v) => v + dB * 60);
      if (cur.clutchEngaged) setIdler((v) => v - steps * 72);
      setMoves((m) => m + 1);
      setMsg(cur.clutchEngaged
        ? `Clutch engaged: disc ${disc === DISC_A ? "I" : "II"} turned ${steps > 0 ? "clockwise" : "counter-clockwise"}, the other disc turned the opposite way.`
        : `Disc ${disc === DISC_A ? "I" : "II"} turned on its own.`);
      return r.state;
    });
  }, []);

  const toggleClutch = useCallback(() => {
    setS((cur) => {
      if (progress(cur).solved) return cur;
      const r = setClutch(cur, !cur.clutchEngaged);
      setMoves((m) => m + 1);
      setMsg(r.state.clutchEngaged ? "Idler gears dropped: the discs are now linked and turn in opposite directions." : "Idler gears raised: each disc turns on its own again.");
      return r.state;
    });
  }, []);

  const step = useCallback(() => {
    const mv = nextOptimalMove(s);
    if (!mv) { setAuto(false); return; }
    if (mv.kind === "clutch") toggleClutch();
    else { setSel(mv.disc); rotate(mv.disc, mv.steps); }
  }, [s, rotate, toggleClutch]);

  useEffect(() => {
    if (!auto) return;
    if (p.solved) { setAuto(false); return; }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(step, reduce ? 250 : 750);
    return () => window.clearTimeout(t);
  }, [auto, step, p.solved]);

  useEffect(() => {
    if (p.solved) setMsg(`Solved in ${moves} moves (optimal: ${optimalAtStart}). In the game the iron gate opens and stays open for the whole team.`);
  }, [p.solved]); // eslint-disable-line react-hooks/exhaustive-deps

  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === "a" || k === "arrowleft") rotate(sel, -1);
    else if (k === "d" || k === "arrowright") rotate(sel, 1);
    else if (k === "tab" || k === "w" || k === "s" || k === "arrowup" || k === "arrowdown") setSel((v) => (v === DISC_A ? DISC_B : DISC_A));
    else if (k === " ") toggleClutch();
    else return;
    e.preventDefault();
  };

  const idlerY = s.clutchEngaged ? CY - R - 4 : CY - R - 44;
  const goldA = p.doneA ? "#f0c66a" : "#4a3b28";
  const goldB = p.doneB ? "#f0c66a" : "#4a3b28";

  return (
    <div className="demo" ref={root}>
      <div className="demo-bar">
        <div className="btn-row">
          <button className="btn" onClick={() => setSel(DISC_A)} aria-pressed={sel === DISC_A}>Disc I</button>
          <button className="btn" onClick={() => setSel(DISC_B)} aria-pressed={sel === DISC_B}>Disc II</button>
          <button className="btn" onClick={() => rotate(sel, -1)} aria-label="Turn selected disc counter-clockwise">⟲</button>
          <button className="btn" onClick={() => rotate(sel, 1)} aria-label="Turn selected disc clockwise">⟳</button>
          <button className="btn" onClick={toggleClutch} aria-pressed={s.clutchEngaged}>{s.clutchEngaged ? "Clutch: engaged" : "Clutch: free"}</button>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={step} disabled={p.solved}>Hint step</button>
          <button className="btn" onClick={() => setAuto((a) => !a)} disabled={p.solved} aria-pressed={auto}>{auto ? "Pause" : "Auto-solve"}</button>
          <button className="btn" onClick={() => reset(initial)}>Restart</button>
          <button className="btn" onClick={() => setSeed((x) => x + 1)}>New puzzle</button>
          <label className="small muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={seizeB} onChange={(e) => setSeizeB(e.target.checked)} /> Disc II seized (game default)
          </label>
        </div>
      </div>
      <div className="demo-body" tabIndex={0} onKeyDown={onKey} aria-label="Coin lock puzzle. A/D turn, Tab switches disc, Space toggles the clutch." style={{ outline: "none" }}>
        <svg viewBox="0 0 810 330" width="100%" role="img" aria-label="Two coin discs between an energy source and a gate seal">
          <defs>
            <radialGradient id="cl-glow"><stop offset="0" stopColor="#f0c66a" stopOpacity="0.55" /><stop offset="1" stopColor="#f0c66a" stopOpacity="0" /></radialGradient>
          </defs>
          {/* conduit: source → A → junction → B → seal */}
          <line x1={40} y1={CY} x2={AX - R} y2={CY} stroke="#f0c66a" strokeWidth="7" strokeLinecap="round" />
          <line x1={AX + R} y1={CY} x2={JX} y2={CY} stroke={goldA} strokeWidth="7" strokeLinecap="round" style={{ transition: "stroke .4s" }} />
          <line x1={JX} y1={CY} x2={BX - R} y2={CY} stroke={goldA} strokeWidth="7" strokeLinecap="round" style={{ transition: "stroke .4s" }} />
          <line x1={BX + R} y1={CY} x2={770} y2={CY} stroke={goldB} strokeWidth="7" strokeLinecap="round" style={{ transition: "stroke .4s" }} />
          <circle cx={40} cy={CY} r={16} fill="#f0c66a" /><text x={40} y={CY + 40} textAnchor="middle" fill="#aa9b82" fontSize="12">source</text>
          <circle cx={JX} cy={CY} r={9} fill={goldA} stroke="#d9b25e" />
          <g>
            {p.solved && <circle cx={770} cy={CY} r={44} fill="url(#cl-glow)" />}
            <rect x={754} y={CY - 18} width={32} height={36} rx={4} fill={p.solved ? "#f0c66a" : "#3a2f25"} stroke="#d9b25e" strokeWidth="2" />
            <text x={770} y={CY + 44} textAnchor="middle" fill="#aa9b82" fontSize="12">gate seal</text>
          </g>
          {/* idler gears (the clutch): raised = free, lowered = meshing with both discs */}
          <rect x={JX - 50} y={CY - R - 70} width={100} height={8} rx={3} fill="#2a1f15" stroke="#50412f" />
          <Gear x={JX - 26} y={idlerY} spin={idler} />
          <Gear x={JX + 26} y={idlerY} spin={-idler} />
          <g>
            <Disc cx={AX} angle={visA} label="I" coin="sun" done={p.doneA} seized={false} selected={sel === DISC_A} onPick={() => setSel(DISC_A)} />
          </g>
          <g key={`b${shake}`} className={shake ? "cl-shake" : ""}>
            <Disc cx={BX} angle={visB} label="II" coin="moon" done={p.doneB} seized={s.seizedB} selected={sel === DISC_B} onPick={() => setSel(DISC_B)} />
          </g>
        </svg>
        <p aria-live="polite" style={{ minHeight: "3em", margin: "6px 4px 0" }} className={p.solved ? "gilt" : "muted"}>{msg}</p>
      </div>
      <div className="demo-foot">
        Moves: <b>{moves}</b> · fewest remaining: <b>{remaining}</b> (breadth-first search over 72 states) · puzzle needed at least <b>{optimalAtStart}</b>.
        Keys: <span className="kbd">A</span>/<span className="kbd">D</span> turn, <span className="kbd">Tab</span> switch disc, <span className="kbd">Space</span> clutch (click the board first).
      </div>
      <style>{`
        .cl-sel { animation: clspin 8s linear infinite; transform-origin: center; transform-box: fill-box; }
        @keyframes clspin { to { transform: rotate(360deg); } }
        .cl-shake { animation: clshake .35s; }
        @keyframes clshake { 20% { transform: translateX(-5px); } 40% { transform: translateX(5px); } 60% { transform: translateX(-3px); } 80% { transform: translateX(3px); } }
      `}</style>
    </div>
  );
}
