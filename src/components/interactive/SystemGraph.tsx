import { useEffect, useState } from "react";

// How the main gameplay systems hand work to each other. Each scenario is a real call chain in the code base;
// node names are the actual classes. Columns: owning client -> network -> server -> replicated state -> presentation.

type Node = { id: string; x: number; y: number; title: string; cls: string; role: string; link?: string };
const COLS = [
  { x: 95, label: "Owning client" },
  { x: 300, label: "Network" },
  { x: 505, label: "Server (authority)" },
  { x: 710, label: "Replicated state" },
  { x: 905, label: "Presentation (local)" },
];
const N: Node[] = [
  { id: "input", x: 95, y: 70, title: "Input", cls: "AUS_Character", role: "Enhanced Input actions; one mapping context per class, cleared on every class switch." },
  { id: "interact", x: 95, y: 170, title: "Interact trace", cls: "UUS_InteractComponent", role: "Sphere sweep, glyph prompt, hold progress, local refusal.", link: "systems/interaction/" },
  { id: "cmc", x: 95, y: 280, title: "Movement", cls: "UUS_CharacterMovementComponent", role: "Client prediction; portal claim as FLAG_Custom_0; room gravity.", link: "systems/predicted-portals/" },
  { id: "rpc", x: 300, y: 170, title: "Server RPC", cls: "Interact_Server / PC bridge", role: "Reliable server RPCs; the PlayerController bridges RPCs for actors the client does not own (NPCs, the coin lock).", link: "systems/interaction/" },
  { id: "moves", x: 300, y: 280, title: "Saved moves", cls: "FUS_SavedMove_Character", role: "Compressed flags travel with each move; never combined.", link: "systems/predicted-portals/" },
  { id: "target", x: 505, y: 120, title: "Interactable", cls: "IUS_Interactable / AUS_TrialSwitch", role: "Re-checks distance and line of sight, then acts. LinkedTargets fans out to doors, portals, lifts.", link: "systems/interaction/" },
  { id: "world", x: 505, y: 215, title: "Mechanisms", cls: "AUS_SlidingDoor · AUS_TrialPortal · AUS_Stage2RollingShelf", role: "World objects with server-owned state.", link: "systems/rolling-shelves/" },
  { id: "portal", x: 505, y: 300, title: "Portal resolve", cls: "USTrialPortal::ResolveTraversal", role: "Pure function both ends run; server may reject with a timestamp.", link: "systems/predicted-portals/" },
  { id: "ai", x: 505, y: 395, title: "Guard AI", cls: "AUS_MinionAIController", role: "Perception poll, alert arbitration (Lure > Sight > Noise), Behavior Tree.", link: "systems/minion-alerts/" },
  { id: "chase", x: 505, y: 480, title: "Chase fatigue", cls: "UUS_ChaseFatigueSubsystem", role: "Per-player heat, per-chaser stamina, sprint tokens.", link: "systems/chase-fatigue/" },
  { id: "mode", x: 505, y: 42, title: "Game mode", cls: "AUS_GameMode", role: "Stage flow, task completion, death handling, travel.", link: "systems/team-muster/" },
  { id: "gs", x: 710, y: 70, title: "Game state", cls: "AUS_GameState", role: "Team snapshots: muster, victory, coin progress, phase. Packed structs so fields arrive together.", link: "systems/team-muster/" },
  { id: "actorrep", x: 710, y: 215, title: "Actor state", cls: "bOpen · FUS_RollingShelfState · FUS_CoinLockState", role: "ReplicatedUsing snapshots; both ends evaluate motion from server time.", link: "systems/rolling-shelves/" },
  { id: "correct", x: 710, y: 300, title: "Corrections", cls: "ClientAdjustPosition / Client_RejectPortalTraversal", role: "CMC's own correction path; the reject RPC rides the Character's channel.", link: "systems/predicted-portals/" },
  { id: "head", x: 710, y: 440, title: "Head status", cls: "FUS_MinionHeadStatus", role: "Icon + chase target, replicated per guard.", link: "systems/chase-fatigue/" },
  { id: "hud", x: 905, y: 70, title: "Shared HUD", cls: "UUS_SharedHUDWidget", role: "NativePaint HUD: stamina, prompt, muster ring, location banner." },
  { id: "anim", x: 905, y: 215, title: "Local motion", cls: "OnRep → mesh, sound", role: "Doors slide, shelves roll, sounds play locally; dedicated servers skip it." },
  { id: "flash", x: 905, y: 300, title: "Arrival feedback", cls: "Camera fade + banner", role: "Guarded by bClientUpdating so replays never re-trigger it." },
  { id: "ring", x: 905, y: 440, title: "Head icon & threat ring", cls: "UUS_MinionStatusComponent · UUS_ThreatRingComponent", role: "Read-only presentation of replicated state.", link: "systems/chase-fatigue/" },
];
const byId = Object.fromEntries(N.map((n) => [n.id, n]));

const SCENARIOS: { id: string; name: string; hops: [string, string, string][] }[] = [
  {
    id: "lever", name: "Pull a lever",
    hops: [
      ["input", "interact", "E pressed: the component sweeps, finds a lever and checks CanInteract locally."],
      ["interact", "rpc", "Hold completes: Interact_Server(target) is sent."],
      ["rpc", "target", "Server re-validates distance and line of sight from the capsule to the lever."],
      ["target", "world", "AUS_TrialSwitch::MarkActivated fires LinkedTargets: OpenDoor() on a sliding door."],
      ["world", "actorrep", "bOpen replicates with RepNotify."],
      ["actorrep", "anim", "Each machine animates the door locally; collision clears when it opens."],
    ],
  },
  {
    id: "portal", name: "Walk through a portal",
    hops: [
      ["input", "cmc", "The capsule overlaps a portal trigger; the CMC only queues the claim (never moves inside the overlap callback)."],
      ["cmc", "moves", "The next saved move carries FLAG_Custom_0."],
      ["moves", "portal", "Client predicts and server replays the same step; both run ResolveTraversal."],
      ["portal", "correct", "If the server cannot find the portal it rejects that timestamp — replays then skip it."],
      ["portal", "flash", "On a real crossing the owning client gets a 0.12 s flash and the location banner."],
    ],
  },
  {
    id: "spotted", name: "A guard spots you",
    hops: [
      ["ai", "ai", "Perception poll (0.3 s): sight writes TargetActor and clears any Noise investigate point."],
      ["ai", "chase", "OnPawnDetected reports the chase: heat, sprint tokens and per-chaser stamina update."],
      ["chase", "head", "The server writes FUS_MinionHeadStatus (icon + who is being chased)."],
      ["head", "ring", "Clients draw the icon above the guard and the threat ring under the chased player."],
    ],
  },
  {
    id: "muster", name: "Everyone at the gate",
    hops: [
      ["mode", "mode", "The third trial completes: the final gate unlocks and the team muster is armed."],
      ["mode", "gs", "UUS_TeamMusterComponent counts living players in the zone; FUS_MusterState replicates as one struct."],
      ["gs", "hud", "Each client draws the muster ring; 3 s after everyone is in, the server re-checks and travels."],
    ],
  },
];

export default function SystemGraph() {
  const [sc, setSc] = useState(SCENARIOS[0].id);
  const [hop, setHop] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [pick, setPick] = useState<string | null>(null);
  const scenario = SCENARIOS.find((s) => s.id === sc)!;
  const active = new Set(scenario.hops.slice(0, hop + 1).flatMap(([a, b]) => [a, b]));
  const base = (import.meta as any).env?.BASE_URL?.replace(/\/$/, "") ?? "";

  useEffect(() => { setHop(0); }, [sc]);
  useEffect(() => {
    if (!playing) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => setHop((h) => (h + 1) % scenario.hops.length), reduce ? 3500 : 2200);
    return () => window.clearTimeout(t);
  }, [playing, hop, scenario]);

  const sel = pick ? byId[pick] : null;
  const [a, b, text] = scenario.hops[hop];

  return (
    <div className="demo">
      <div className="demo-bar">
        <div className="btn-row" role="tablist" aria-label="Scenario">
          {SCENARIOS.map((s) => (
            <button key={s.id} role="tab" aria-selected={sc === s.id} className="btn" aria-pressed={sc === s.id} onClick={() => setSc(s.id)}>{s.name}</button>
          ))}
        </div>
        <div className="btn-row">
          <button className="btn" onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>{playing ? "Pause" : "Play"}</button>
          <button className="btn" onClick={() => { setPlaying(false); setHop((h) => Math.max(0, h - 1)); }} aria-label="Previous hop">◀</button>
          <button className="btn" onClick={() => { setPlaying(false); setHop((h) => Math.min(scenario.hops.length - 1, h + 1)); }} aria-label="Next hop">▶</button>
        </div>
      </div>
      <div className="demo-body">
        <div className="sg-scroll">
          <svg viewBox="0 0 1000 530" className="sg-svg" role="img" aria-label={`Call chain: ${scenario.name}`}>
            {COLS.map((c) => (
              <g key={c.x}>
                <rect x={c.x - 92} y={8} width={184} height={515} rx={10} fill="rgba(255,255,255,0.018)" stroke="#2a221a" />
                <text x={c.x} y={524} textAnchor="middle" fontSize={11} fill="#7a6c58" letterSpacing="1.5">{c.label.toUpperCase()}</text>
              </g>
            ))}
            {scenario.hops.map(([x, y], i) => {
              if (x === y) return null;
              const A = byId[x], B = byId[y];
              const on = i <= hop;
              return (
                <path key={i} d={`M ${A.x + 80} ${A.y} C ${(A.x + B.x) / 2 + 40} ${A.y}, ${(A.x + B.x) / 2 - 40} ${B.y}, ${B.x - 80} ${B.y}`}
                  fill="none" stroke={on ? "#f0c66a" : "#3a2f25"} strokeWidth={on ? 2.6 : 1.4}
                  className={i === hop ? "sg-flow" : undefined} markerEnd={on ? "url(#sg-arrow)" : undefined} />
              );
            })}
            <defs>
              <marker id="sg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#f0c66a" />
              </marker>
            </defs>
            {N.map((n) => {
              const on = active.has(n.id);
              const cur = n.id === a || n.id === b;
              return (
                <g key={n.id} onClick={() => setPick(n.id)} style={{ cursor: "pointer" }} tabIndex={0} role="button"
                  aria-label={`${n.title}: ${n.cls}`} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPick(n.id); } }}>
                  <rect x={n.x - 80} y={n.y - 26} width={160} height={52} rx={9}
                    fill={cur ? "#3a2c18" : on ? "#2a2117" : "#1b1611"} stroke={cur ? "#f0d48f" : on ? "#9c7e3d" : "#3a2f25"} strokeWidth={cur ? 2 : 1} />
                  <text x={n.x} y={n.y - 5} textAnchor="middle" fontSize={13} fontWeight={600} fill={on ? "#ece2cb" : "#8a7c66"}>{n.title}</text>
                  <text x={n.x} y={n.y + 13} textAnchor="middle" fontSize={9.5} fill={on ? "#d9b25e" : "#6a5d4b"} fontFamily="JetBrains Mono, monospace">
                    {n.cls.length > 28 ? n.cls.slice(0, 27) + "…" : n.cls}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <div className="sg-text" aria-live="polite">
          <span className="pill">Hop {hop + 1}/{scenario.hops.length}</span> {text}
        </div>
        {sel && (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="eyebrow">{sel.title}</div>
            <div><code>{sel.cls}</code></div>
            <p className="small" style={{ margin: "6px 0 0" }}>{sel.role}</p>
            {sel.link && <a className="small" href={`${base}/${sel.link}`}>Read the write-up →</a>}
          </div>
        )}
      </div>
      <div className="demo-foot">Class names are real; scenarios are simplified to the main hand-offs. Click any node for its role.</div>
      <style>{`
        .sg-scroll { overflow-x: auto; }
        .sg-svg { min-width: 760px; width: 100%; display: block; }
        .sg-flow { stroke-dasharray: 8 6; animation: sgf 0.8s linear infinite; }
        @keyframes sgf { to { stroke-dashoffset: -28; } }
        .sg-text { margin-top: 12px; min-height: 2.8em; }
      `}</style>
    </div>
  );
}
