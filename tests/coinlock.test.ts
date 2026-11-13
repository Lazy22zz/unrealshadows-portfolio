import { describe, expect, it } from "vitest";
import {
  applyRotation, buildPuzzle, minMovesToSolve, nextOptimalMove, setClutch, shortestSignedSteps, wrapPosition,
  type CoinLockState,
} from "../src/lib/coinlock";

const S = (rotA: number, rotB: number, aimA: number, aimB: number, clutch = false, seized = false): CoinLockState => ({
  rotA, rotB, aimA, aimB, clutchEngaged: clutch, seizedB: seized, lastDriver: 0,
});

describe("coin lock rules (mirror UnrealShadows.Stage1.CoinLock.Rules)", () => {
  it("wraps and finds the short way round", () => {
    expect(wrapPosition(-1)).toBe(5);
    expect(wrapPosition(7)).toBe(1);
    expect(shortestSignedSteps(5, 0)).toBe(1);
    expect(shortestSignedSteps(0, 5)).toBe(-1);
  });

  it("disengaged: turning one disc leaves the other untouched (the original bug)", () => {
    for (let a = 0; a < 6; a++) {
      for (let b = 0; b < 6; b++) {
        const r = applyRotation(S(a, b, 0, 0), 0, 1);
        expect(r.result).toBe("rotated");
        expect(r.state.rotB).toBe(b);
      }
    }
  });

  it("engaged: the other disc turns the opposite way", () => {
    const r = applyRotation(S(0, 0, 0, 0, true), 0, 1);
    expect(r.state.rotA).toBe(1);
    expect(r.state.rotB).toBe(5);
  });

  it("seized B refuses to drive and leaves the state alone", () => {
    const s = S(2, 3, 0, 0, true, true);
    const r = applyRotation(s, 1, 1);
    expect(r.result).toBe("seized");
    expect(r.state).toEqual(s);
  });

  it("same-value clutch writes report no change", () => {
    expect(setClutch(S(0, 0, 0, 0, false), false).changed).toBe(false);
  });

  it("every state is solvable; worst cases are 4 / 5 / 7 like the C++ test", () => {
    const worst = [[0, 0], [0, 0]];
    for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) for (let aa = 0; aa < 6; aa++) for (let ab = 0; ab < 6; ab++) {
      for (const seized of [0, 1]) {
        for (const clutch of [0, 1]) {
          const m = minMovesToSolve(S(a, b, aa, ab, clutch === 1, seized === 1));
          expect(m).toBeGreaterThanOrEqual(0);
          worst[seized][clutch] = Math.max(worst[seized][clutch], m);
        }
      }
    }
    expect(worst[0][0]).toBe(4);
    expect(worst[0][1]).toBe(5);
    expect(Math.max(worst[1][0], worst[1][1])).toBe(7);
  });

  it("buildPuzzle keeps its contract", () => {
    let seed = 1;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 200; i++) {
      for (const seized of [false, true]) {
        const min = seized ? 5 : 3;
        const s = buildPuzzle(rand, min, seized);
        expect(s.clutchEngaged).toBe(false);
        expect(s.rotA).not.toBe(s.aimA);
        expect(s.rotB).not.toBe(s.aimB);
        const m = minMovesToSolve(s);
        expect(m).toBeGreaterThanOrEqual(min);
        expect(m).toBeLessThanOrEqual(seized ? 6 : 4);
      }
    }
  });

  it("the hint always moves one step closer", () => {
    let s = S(3, 1, 0, 4, false, true);
    let n = minMovesToSolve(s);
    while (n > 0) {
      const mv = nextOptimalMove(s)!;
      s = mv.kind === "clutch" ? setClutch(s, !s.clutchEngaged).state : applyRotation(s, mv.disc, mv.steps).state;
      expect(minMovesToSolve(s)).toBe(n - 1);
      n--;
    }
  });
});
