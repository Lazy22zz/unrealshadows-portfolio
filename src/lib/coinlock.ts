// TypeScript port of USCoinLock (Source/UnrealShadows_LOTL/Public/Framework/US_CoinLockTypes.h
// and Private/Framework/US_CoinLockTypes.cpp). Same rules, same names.
// tests/coinlock.test.ts asserts the values the C++ test UnrealShadows.Stage1.CoinLock.Rules asserts.

export const NUM_POSITIONS = 6;
export const DISC_A = 0;
export const DISC_B = 1;

export interface CoinLockState {
  rotA: number;
  rotB: number;
  aimA: number;
  aimB: number;
  clutchEngaged: boolean;
  seizedB: boolean;
  lastDriver: number;
}
export type RotateResult = "rotated" | "seized" | "invalid";

export const wrapPosition = (raw: number) => ((raw % NUM_POSITIONS) + NUM_POSITIONS) % NUM_POSITIONS;

export function shortestSignedSteps(from: number, to: number): number {
  const forward = wrapPosition(to - from);
  return forward > NUM_POSITIONS / 2 ? forward - NUM_POSITIONS : forward;
}

/** B can never be the driving disc while seized; it only follows A through the clutch. */
export const canDrive = (s: CoinLockState, disc: number) => disc === DISC_A || (disc === DISC_B && !s.seizedB);

/** The only function that changes rotA / rotB. Engaged clutch: the other disc turns the opposite way. */
export function applyRotation(s: CoinLockState, disc: number, steps: number): { state: CoinLockState; result: RotateResult } {
  if ((disc !== DISC_A && disc !== DISC_B) || steps === 0) return { state: s, result: "invalid" };
  if (!canDrive(s, disc)) return { state: s, result: "seized" };
  const other = s.clutchEngaged ? -steps : 0;
  const dA = disc === DISC_A ? steps : other;
  const dB = disc === DISC_B ? steps : other;
  return {
    state: { ...s, rotA: wrapPosition(s.rotA + dA), rotB: wrapPosition(s.rotB + dB), lastDriver: disc },
    result: "rotated",
  };
}

export function setClutch(s: CoinLockState, engaged: boolean): { state: CoinLockState; changed: boolean } {
  if (s.clutchEngaged === engaged) return { state: s, changed: false };
  return { state: { ...s, clutchEngaged: engaged }, changed: true };
}

export const progress = (s: CoinLockState) => {
  const doneA = s.rotA === s.aimA;
  const doneB = s.rotB === s.aimB;
  return { doneA, doneB, solved: doneA && doneB };
};

/** Breadth-first search over (rotA, rotB, clutch): 72 states. One move = one 60-degree turn or one clutch pull. */
export function minMovesToSolve(s: CoinLockState): number {
  const key = (a: number, b: number, c: boolean) => (a * NUM_POSITIONS + b) * 2 + (c ? 1 : 0);
  const dist: number[] = new Array(NUM_POSITIONS * NUM_POSITIONS * 2).fill(-1);
  const start = { ...s };
  dist[key(start.rotA, start.rotB, start.clutchEngaged)] = 0;
  const q: CoinLockState[] = [start];
  for (let h = 0; h < q.length; h++) {
    const cur = q[h];
    const d = dist[key(cur.rotA, cur.rotB, cur.clutchEngaged)];
    if (cur.rotA === s.aimA && cur.rotB === s.aimB) return d;
    const visit = (n: CoinLockState) => {
      const k = key(n.rotA, n.rotB, n.clutchEngaged);
      if (dist[k] < 0) {
        dist[k] = d + 1;
        q.push(n);
      }
    };
    visit(setClutch(cur, !cur.clutchEngaged).state);
    for (const disc of [DISC_A, DISC_B]) {
      for (const step of [-1, 1]) {
        const r = applyRotation(cur, disc, step);
        if (r.result === "rotated") visit(r.state);
      }
    }
  }
  return -1;
}

export type Move = { kind: "clutch" } | { kind: "rotate"; disc: number; steps: number };

/** An optimal next move from a state (for the hint button). Returns null when solved. */
export function nextOptimalMove(s: CoinLockState): Move | null {
  const now = minMovesToSolve(s);
  if (now <= 0) return null;
  if (minMovesToSolve(setClutch(s, !s.clutchEngaged).state) === now - 1) return { kind: "clutch" };
  for (const disc of [DISC_A, DISC_B]) {
    for (const steps of [-1, 1]) {
      const r = applyRotation(s, disc, steps);
      if (r.result === "rotated" && minMovesToSolve(r.state) === now - 1) return { kind: "rotate", disc, steps };
    }
  }
  return null;
}

/** Same contract as USCoinLock::BuildPuzzle: both discs off their aim, clutch disengaged, at least minMoves. */
export function buildPuzzle(rand: () => number, minMoves: number, seizeB: boolean): CoinLockState {
  const r6 = () => Math.floor(rand() * NUM_POSITIONS);
  const base: CoinLockState = { rotA: 0, rotB: 0, aimA: r6(), aimB: r6(), clutchEngaged: false, seizedB: seizeB, lastDriver: DISC_A };
  for (let i = 0; i < 64; i++) {
    const s = { ...base, rotA: r6(), rotB: r6() };
    if (s.rotA !== s.aimA && s.rotB !== s.aimB && minMovesToSolve(s) >= Math.max(1, minMoves)) return s;
  }
  return { ...base, rotA: wrapPosition(base.aimA + 2), rotB: wrapPosition(base.aimB + 3) };
}
