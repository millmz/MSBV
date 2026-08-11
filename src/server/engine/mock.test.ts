import { describe, expect, it } from "vitest";
import type { League, Player } from "../../core/types.js";
import type { BlendMap } from "./blend.js";
import { bestStarters, evaluateMock, rosterSize, simulateOpponentPick, snakeTeamIndex } from "./mock.js";

const league = {
  id: "espn:1",
  platform: "espn",
  name: "Mock",
  scoring: { label: "PPR", perStat: { rec: 1 } },
  lineupSlots: { QB: 1, RB: 1, WR: 1, TE: 0, K: 1, DST: 0, FLEX: 1, BENCH: 2, IR: 0 },
  teams: [],
} as unknown as League;

const players = new Map<string, Player>(
  (
    [
      ["q1", "QB"], ["q2", "QB"], ["q3", "QB"],
      ["r1", "RB"], ["r2", "RB"], ["r3", "RB"],
      ["w1", "WR"], ["w2", "WR"], ["w3", "WR"],
      ["k1", "K"],
    ] as const
  ).map(([id, position], i) => [
    id,
    { id, name: id.toUpperCase(), position, team: "T", searchRank: i + 1 } as Player,
  ]),
);

const blends: BlendMap = new Map(
  [...players.keys()].map((id, i) => [
    id,
    { playerId: id, points: 300 - i * 20, floor: 0, ceiling: 0, sources: {}, volatile: false },
  ]),
);

describe("snakeTeamIndex", () => {
  it("snakes: 0,1,2,3 then 3,2,1,0", () => {
    const order = Array.from({ length: 8 }, (_, i) => snakeTeamIndex(i, 4));
    expect(order).toEqual([0, 1, 2, 3, 3, 2, 1, 0]);
  });
});

describe("rosterSize", () => {
  it("sums starters, flex, and bench", () => {
    expect(rosterSize(league)).toBe(7);
  });
});

describe("simulateOpponentPick", () => {
  const market = [...players.keys()];
  it("takes the market's top available name with rand pinned high", () => {
    const pick = simulateOpponentPick({
      league, players, marketOrder: market,
      taken: new Set(["q1"]), teamPicks: [], roundsLeft: 7, rand: () => 0,
    });
    expect(pick).toBe("q2");
  });
  it("refuses kickers until the endgame and caps quarterbacks", () => {
    const pick = simulateOpponentPick({
      league, players, marketOrder: ["k1", "q3", "w2"],
      taken: new Set(), teamPicks: ["q1", "q2"], roundsLeft: 5, rand: () => 0,
    });
    expect(pick).toBe("w2"); // k1 too early, q3 over the QB cap
  });
  it("fills the kicker before the draft runs out", () => {
    const pick = simulateOpponentPick({
      league, players, marketOrder: market,
      taken: new Set(), teamPicks: ["q1", "r1", "w1", "r2", "w2"], roundsLeft: 1, rand: () => 0,
    });
    expect(pick).toBe("k1");
  });
});

describe("evaluateMock", () => {
  it("optimal starters + flex, ranks the stacked team first", () => {
    const strong = ["q1", "r1", "w1", "r2", "k1"]; // r2 lands in FLEX
    const weak = ["q3", "r3", "w3", "w2", "q2"];
    const starters = bestStarters(league, strong, blends, players);
    expect(starters.map((s) => s.slot).sort()).toEqual(["FLEX", "K", "QB", "RB", "WR"]);

    const report = evaluateMock({
      league, blends, players,
      teams: [strong, weak], myTeamIndex: 0,
    });
    expect(report.myRank).toBe(1);
    expect(report.myStarterPoints).toBeGreaterThan(report.fieldAverage);
    const flexEdge = report.positionEdges.find((e) => e.position === "FLEX");
    expect(flexEdge).toBeDefined();
  });
});
