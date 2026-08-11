import { describe, expect, it } from "vitest";
import type { League, Player } from "../../core/types.js";
import type { BlendMap } from "./blend.js";
import { bestAvailable } from "./draft.js";
import type { VorEntry } from "./vor.js";

const league = {
  id: "espn:1",
  platform: "espn",
  scoring: { label: "PPR", perStat: { rec: 1 } },
  lineupSlots: { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DST: 1, FLEX: 1, BENCH: 5, IR: 0 },
  teams: [],
} as unknown as League;

const players = new Map<string, Player>(
  (
    [
      ["r1", "RB"], ["r2", "RB"], ["w1", "WR"], ["w2", "WR"], ["q1", "QB"], ["t1", "TE"],
      ["d1", "DST"], ["k1", "K"],
    ] as const
  ).map(([id, position]) => [id, { id, name: id, position, team: "SF" } as Player]),
);

const entry = (playerId: string, points: number, vor: number, tier = 1): [string, VorEntry] => [
  playerId,
  { playerId, points, vor, tier, positionRank: 1 } as VorEntry,
];

// A defense with a WR-sized VOR — the exact shape of the reported bug.
const vor = new Map<string, VorEntry>([
  entry("r1", 300, 55),
  entry("r2", 280, 45),
  entry("w1", 290, 50),
  entry("w2", 270, 40),
  entry("q1", 380, 35),
  entry("t1", 220, 30),
  entry("d1", 130, 48),
  entry("k1", 140, 25),
]);

const blends: BlendMap = new Map();

describe("bestAvailable K/DST endgame gating", () => {
  it("never suggests a defense early, even with a huge VOR and an open slot", () => {
    const advice = bestAvailable({
      league, blends, vor, players,
      taken: new Set(), myPicks: [],
      roundsLeft: 14, // round 1 of a 14-round draft
      limit: 8,
    });
    const top = advice.slice(0, 6).map((a) => a.playerId);
    expect(top).not.toContain("d1");
    expect(top).not.toContain("k1");
    const dst = advice.find((a) => a.playerId === "d1")!;
    expect(dst.reasons.join(" ")).toMatch(/endgame/i);
  });

  it("suppresses K/DST when roundsLeft is unknown", () => {
    const advice = bestAvailable({ league, blends, vor, players, taken: new Set(), myPicks: [], limit: 4 });
    expect(advice.slice(0, 4).map((a) => a.playerId)).not.toContain("d1");
  });

  it("surfaces K/DST once only their slots remain", () => {
    const advice = bestAvailable({
      league, blends, vor, players,
      taken: new Set(["r1", "r2", "w1", "w2", "q1", "t1"]),
      myPicks: ["r1", "r2", "w1", "w2", "q1", "t1"],
      roundsLeft: 2,
      limit: 3,
    });
    expect(advice[0]!.playerId === "d1" || advice[0]!.playerId === "k1").toBe(true);
    expect(advice[0]!.reasons.join(" ")).toMatch(/Time to fill/);
  });
});

describe("bestAvailable market timing", () => {
  it("discounts a player the market ranks far later", () => {
    const market = new Map([["r1", 2], ["w1", 60]]); // w1 will still be there next turn
    const advice = bestAvailable({
      league, blends, vor, players,
      taken: new Set(), myPicks: [],
      roundsLeft: 14, picksUntilNext: 8, market, currentOverall: 5,
      limit: 8,
    });
    const w1 = advice.find((a) => a.playerId === "w1")!;
    const r1 = advice.find((a) => a.playerId === "r1")!;
    expect(w1.reasons.join(" ")).toMatch(/still there/);
    expect(r1.score).toBeGreaterThan(w1.score);
  });
});
