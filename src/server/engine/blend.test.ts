import { describe, expect, it } from "vitest";
import type { Player, PlayerProjection } from "../../core/types.js";
import { computeBlends } from "./blend.js";
import { buildCheatSheet } from "./draft.js";
import type { VorEntry } from "./vor.js";

const players = new Map<string, Player>([
  ["w1", { id: "w1", name: "Alpha Receiver", position: "WR", team: "MIN" } as Player],
  ["w2", { id: "w2", name: "FP Only Guy", position: "WR", team: "NO" } as Player],
  ["d1", { id: "d1", name: "Niners DST", position: "DST", team: "SF" } as Player],
]);

const rules = { label: "PPR", perStat: { rec: 1, rec_yd: 0.1 } };

const proj = (playerId: string, recYd: number): PlayerProjection => ({
  playerId,
  source: "sleeper",
  season: 2026,
  week: 0,
  stats: { rec_yd: recYd },
  defaultPoints: recYd / 10,
});

describe("computeBlends with FantasyPros", () => {
  it("weights fantasypros heaviest in the mean", () => {
    // sleeper says 100, fantasypros says 200 → weighted (1×100 + 2.5×200)/3.5 ≈ 171
    const blends = computeBlends({
      players,
      sleeperProjections: [proj("w1", 1000)],
      fpProjections: new Map([["w1", 200]]),
      rules: rules as never,
    });
    const b = blends.get("w1")!;
    expect(b.points).toBeGreaterThan(160); // an equal-weight mean would be 150
    expect(b.points).toBeLessThan(180);
    expect(b.sources.fantasypros).toBe(200);
  });

  it("backfills players only FantasyPros projects", () => {
    const blends = computeBlends({
      players,
      sleeperProjections: [proj("w1", 1000)],
      fpProjections: new Map([["w2", 180]]),
      rules: rules as never,
    });
    expect(blends.get("w2")).toBeDefined();
    expect(blends.get("w2")!.sources).toEqual({ fantasypros: 180 });
  });
});

describe("buildCheatSheet K/DST demotion", () => {
  it("sorts defenses behind every skill player regardless of VOR", () => {
    const vor = new Map<string, VorEntry>([
      ["d1", { playerId: "d1", points: 130, vor: 60, tier: 1, positionRank: 1 } as VorEntry],
      ["w1", { playerId: "w1", points: 250, vor: 40, tier: 1, positionRank: 1 } as VorEntry],
      ["w2", { playerId: "w2", points: 180, vor: 5, tier: 3, positionRank: 2 } as VorEntry],
    ]);
    const blends = computeBlends({
      players,
      sleeperProjections: [proj("w1", 2500), proj("w2", 1800), proj("d1", 1300)],
      rules: rules as never,
    });
    const sheet = buildCheatSheet(blends, vor, players, 10);
    const order = sheet.map((r) => r.playerId);
    expect(order.indexOf("d1")).toBeGreaterThan(order.indexOf("w1"));
    expect(order.indexOf("d1")).toBeGreaterThan(order.indexOf("w2"));
  });
});
