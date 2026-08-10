import { describe, expect, it } from "vitest";
import type { RosterSlot } from "../../core/types.js";
import { computeBlends } from "./blend.js";
import { bestAvailable, buildCheatSheet, rosterNeeds } from "./draft.js";
import { optimalLineup, recommendLineup } from "./lineup.js";
import { computeMispricings } from "./mispricing.js";
import { PPR_RULES, scoreStatLine } from "./scoring.js";
import { mkBlends, mkLeague, mkPlayers } from "./testkit.js";
import { evaluateTrade, findTrades } from "./trades.js";
import { computeUsageInsights } from "./usage.js";
import { assignTiers, computeVor, replacementLevels, starterCounts } from "./vor.js";
import { computeWaivers } from "./waivers.js";

/* ---------- scoring ---------- */

describe("scoreStatLine", () => {
  it("hand-checks a PPR stat line", () => {
    // 8 rec, 110 rec yds, 1 rec TD, 20 rush yds → 8 + 11 + 6 + 2 = 27
    const points = scoreStatLine({ rec: 8, rec_yd: 110, rec_td: 1, rush_yd: 20 }, PPR_RULES);
    expect(points).toBeCloseTo(27);
  });

  it("ignores stats the league doesn't score", () => {
    expect(scoreStatLine({ made_up_stat: 100 }, PPR_RULES)).toBe(0);
  });
});

/* ---------- blend ---------- */

describe("computeBlends", () => {
  const players = mkPlayers({ A: "WR", B: "WR" });

  it("averages sleeper-scored stats with the platform projection", () => {
    const blends = computeBlends({
      players,
      sleeperProjections: [
        { playerId: "A", source: "sleeper", season: 2026, week: 1, stats: { rec: 5, rec_yd: 50 } }, // 10 PPR pts
      ],
      platformProjections: new Map([["A", 14]]),
      rules: PPR_RULES,
    });
    expect(blends.get("A")!.points).toBeCloseTo(12); // (10 + 14) / 2
    expect(blends.get("A")!.sources).toEqual({ sleeper: 10, platform: 14 });
  });

  it("flags volatility when sources disagree hard", () => {
    const blends = computeBlends({
      players,
      sleeperProjections: [
        { playerId: "A", source: "sleeper", season: 2026, week: 1, stats: { rec: 5, rec_yd: 50 } }, // 10
        { playerId: "B", source: "sleeper", season: 2026, week: 1, stats: { rec: 5, rec_yd: 50 } },
      ],
      platformProjections: new Map([
        ["A", 20], // wild disagreement vs 10
        ["B", 10.5], // agreement
      ]),
      rules: PPR_RULES,
    });
    expect(blends.get("A")!.volatile).toBe(true);
    expect(blends.get("B")!.volatile).toBe(false);
  });

  it("keeps platform-only players", () => {
    const blends = computeBlends({
      players,
      sleeperProjections: [],
      platformProjections: new Map([["B", 9]]),
      rules: PPR_RULES,
    });
    expect(blends.get("B")!.points).toBe(9);
  });
});

/* ---------- VOR ---------- */

describe("starterCounts / replacement / VOR", () => {
  // 2-team league, 1 QB / 1 RB / 1 FLEX each.
  const players = mkPlayers({ Q1: "QB", Q2: "QB", Q3: "QB", R1: "RB", R2: "RB", R3: "RB", R4: "RB", W1: "WR", W2: "WR" });
  const league = mkLeague({
    lineupSlots: { QB: 1, RB: 1, WR: 0, TE: 0, FLEX: 1, K: 0, DST: 0, BENCH: 3, IR: 0 } as Record<RosterSlot, number>,
    teams: [
      { id: "1", name: "A", wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, roster: [] },
      { id: "2", name: "B", wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, roster: [] },
    ],
  });
  const blends = mkBlends({ Q1: 320, Q2: 300, Q3: 250, R1: 240, R2: 200, R3: 180, R4: 100, W1: 190, W2: 90 });

  it("allocates flex slots to the best remaining players", () => {
    const counts = starterCounts(league, blends, players);
    expect(counts.QB).toBe(2);
    // 2 flex slots: next-best after RB starters are R3 (180) and W1 (190) → one each.
    expect(counts.RB).toBe(3);
    expect(counts.WR).toBe(1);
  });

  it("computes replacement level as first man out", () => {
    const repl = replacementLevels(league, blends, players);
    expect(repl.QB).toBe(250); // Q3 is the best unstarted QB
    expect(repl.RB).toBe(100); // R4 after R1-R3 start
  });

  it("gives the top player the biggest VOR", () => {
    const vor = computeVor(league, blends, players);
    expect(vor.get("Q1")!.vor).toBeCloseTo(70);
    expect(vor.get("R1")!.vor).toBeCloseTo(140);
    expect(vor.get("R1")!.positionRank).toBe(1);
  });
});

describe("assignTiers", () => {
  it("breaks tiers on big gaps", () => {
    expect(assignTiers([300, 296, 260, 258, 220])).toEqual([1, 1, 2, 2, 3]);
  });
});

/* ---------- lineup ---------- */

describe("optimalLineup", () => {
  const players = mkPlayers({ Q1: "QB", R1: "RB", R2: "RB", R3: "RB", W1: "WR", W2: "WR", T1: "TE", T2: "TE" });
  const blends = mkBlends({ Q1: 20, R1: 15, R2: 12, R3: 11, W1: 14, W2: 9, T1: 10, T2: 8 });
  const slots = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 0, DST: 0, BENCH: 0, IR: 0 } as Record<RosterSlot, number>;
  const roster = Object.keys(blends instanceof Map ? Object.fromEntries(blends) : {}).map((playerId) => ({ playerId }));
  const rosterIds = ["Q1", "R1", "R2", "R3", "W1", "W2", "T1", "T2"].map((playerId) => ({ playerId }));

  it("fills fixed slots and gives FLEX to the best leftover", () => {
    const lineup = optimalLineup(rosterIds, slots, blends, players, 0);
    const flex = lineup.find((p) => p.slot === "FLEX");
    expect(flex!.playerId).toBe("R3"); // best remaining after R1,R2,W1,W2,T1 fill slots
    const total = lineup.reduce((a, p) => a + p.points, 0);
    expect(total).toBeCloseTo(20 + 15 + 12 + 14 + 9 + 10 + 11);
    void roster;
  });

  it("chases ceiling for underdogs (λ>0 favors volatile players)", () => {
    // Same mean, different spread: SAFE 12±1, BOOM 11.5±6.
    const players2 = mkPlayers({ SAFE: "RB", BOOM: "RB" });
    const blends2 = mkBlends({ SAFE: 12, BOOM: 11.5 }, 0);
    blends2.get("SAFE")!.floor = 11; blends2.get("SAFE")!.ceiling = 13;
    blends2.get("BOOM")!.floor = 5.5; blends2.get("BOOM")!.ceiling = 17.5;
    const oneRb = { QB: 0, RB: 1, WR: 0, TE: 0, FLEX: 0, K: 0, DST: 0, BENCH: 0, IR: 0 } as Record<RosterSlot, number>;
    const both = [{ playerId: "SAFE" }, { playerId: "BOOM" }];

    const meanPick = optimalLineup(both, oneRb, blends2, players2, 0)[0]!.playerId;
    const underdogPick = optimalLineup(both, oneRb, blends2, players2, 0.25)[0]!.playerId;
    const favoredPick = optimalLineup(both, oneRb, blends2, players2, -0.25)[0]!.playerId;
    expect(meanPick).toBe("SAFE");
    expect(underdogPick).toBe("BOOM");
    expect(favoredPick).toBe("SAFE");
  });
});

describe("recommendLineup game state", () => {
  const players = mkPlayers({ Q1: "QB", Q2: "QB" });
  const blends = mkBlends({ Q1: 20, Q2: 5 });
  const roster = (ids: string[]) =>
    ids.map((playerId) => ({ playerId, slot: "BENCH" as RosterSlot, platformPlayerId: playerId }));
  const league = mkLeague({
    lineupSlots: { QB: 1, RB: 0, WR: 0, TE: 0, FLEX: 0, K: 0, DST: 0, BENCH: 2, IR: 0 } as Record<RosterSlot, number>,
    myTeamId: "1",
    currentWeek: 3,
    teams: [
      { id: "1", name: "Me", wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, roster: roster(["Q1"]) },
      { id: "2", name: "Them", wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, roster: roster(["Q2"]) },
    ],
    matchups: [{ week: 3, homeTeamId: "1", awayTeamId: "2" }],
  });

  it("detects the favored posture from projections", () => {
    const rec = recommendLineup(league, league.teams[0]!, blends, players);
    expect(rec.gameState.posture).toBe("favored");
    expect(rec.gameState.oppProjected).toBeCloseTo(5);
  });
});

/* ---------- usage ---------- */

describe("computeUsageInsights", () => {
  const players = mkPlayers({ STAR: "WR", LUCKY: "RB" });
  players.get("STAR")!.gsisId = "g1";
  players.get("LUCKY")!.gsisId = "g2";
  const byGsis = new Map([["g1", players.get("STAR")!], ["g2", players.get("LUCKY")!]]);

  const weeks = [
    // STAR: 10 targets/g (≈18.5 xPts) but scoring only 9 → buy low.
    ...[1, 2, 3].map((week) => ({ gsisId: "g1", week, targets: 10, carries: 0, targetShare: 0.29, fantasyPointsPpr: 9 })),
    // LUCKY: 4 carries/g (≈2.2 xPts) but scoring 12 (TD luck) → sell high.
    ...[1, 2, 3].map((week) => ({ gsisId: "g2", week, targets: 1, carries: 4, fantasyPointsPpr: 12 })),
  ];

  it("flags buy-low on strong usage with weak output", () => {
    const insights = computeUsageInsights(weeks, players, byGsis);
    expect(insights.get("STAR")!.flag).toBe("buy-low");
    expect(insights.get("STAR")!.expectedPpg).toBeCloseTo(18.5);
  });

  it("flags sell-high on output far above opportunity", () => {
    const insights = computeUsageInsights(weeks, players, byGsis);
    expect(insights.get("LUCKY")!.flag).toBe("sell-high");
  });
});

/* ---------- mispricing ---------- */

describe("computeMispricings", () => {
  const players = mkPlayers({ A: "WR", B: "WR", C: "WR", D: "WR" });
  const league = mkLeague({ myTeamId: "1", teams: [
    { id: "1", name: "Me", wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0,
      roster: [{ playerId: "B", slot: "WR" as RosterSlot, platformPlayerId: "B" }] },
  ]});
  // Blend says A is WR1; platform ranks A 30th → big positive edge.
  const blends = mkBlends({ A: 250, B: 240, C: 100, D: 90 });
  const platformRanks = new Map([["A", 30], ["B", 1], ["C", 2], ["D", 3]]);

  it("targets platform-underrated players and fades overrated ones", () => {
    const mis = computeMispricings(league, blends, players, platformRanks, 1);
    const a = mis.find((m) => m.playerId === "A")!;
    expect(a.verdict).toBe("target");
    expect(a.platformRank).toBe(4); // per-position rank among ranked WRs
    expect(a.blendRank).toBe(1);
    const c = mis.find((m) => m.playerId === "C");
    expect(c?.verdict).toBe("fade"); // platform WR2 vs blend WR3
  });
});

/* ---------- waivers ---------- */

describe("computeWaivers", () => {
  const players = mkPlayers({ MYRB: "RB", BENCH1: "RB", FA1: "RB", FA2: "TE" });
  const league = mkLeague({
    myTeamId: "1",
    teams: [
      { id: "1", name: "Me", wins: 1, losses: 1, ties: 0, pointsFor: 0, pointsAgainst: 0,
        roster: [
          { playerId: "MYRB", slot: "RB" as RosterSlot, platformPlayerId: "MYRB" },
          { playerId: "BENCH1", slot: "BENCH" as RosterSlot, platformPlayerId: "BENCH1" },
        ] },
    ],
    freeAgents: [
      { playerId: "FA1", platformPlayerId: "FA1" },
      { playerId: "FA2", platformPlayerId: "FA2" },
    ],
  });
  const seasonBlends = mkBlends({ MYRB: 150, BENCH1: 40, FA1: 170, FA2: 60 });
  const vorMap = new Map(
    [["MYRB", 30], ["BENCH1", -20], ["FA1", 45], ["FA2", 5]].map(([id, v]) => [
      id as string,
      { playerId: id as string, points: 0, vor: v as number, positionRank: 1, tier: 1 },
    ]),
  );

  it("ranks the upgrade first, names the drop, and explains why", () => {
    const { targets, drops } = computeWaivers({
      league, seasonBlends, vor: vorMap, players,
      trending: [{ playerId: "FA1", count: 5000, direction: "add" }],
      usage: new Map(), mispricings: [],
    });
    expect(targets[0]!.playerId).toBe("FA1");
    expect(targets[0]!.upgradeOver?.playerId).toBe("BENCH1");
    expect(targets[0]!.suggestedDrop).toBe("BENCH1");
    expect(targets[0]!.reasons.join(" ")).toMatch(/Sleeper adds/);
    expect(drops[0]!.playerId).toBe("BENCH1");
  });
});

/* ---------- trades ---------- */

describe("evaluateTrade", () => {
  const players = mkPlayers({ R1: "RB", R2: "RB", W1: "WR", W2: "WR" });
  const slots = { QB: 0, RB: 1, WR: 1, TE: 0, FLEX: 0, K: 0, DST: 0, BENCH: 2, IR: 0 } as Record<RosterSlot, number>;
  const league = mkLeague({
    myTeamId: "1",
    lineupSlots: slots,
    teams: [
      { id: "1", name: "Me", wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0,
        roster: [
          { playerId: "R1", slot: "RB" as RosterSlot, platformPlayerId: "R1" },
          { playerId: "R2", slot: "BENCH" as RosterSlot, platformPlayerId: "R2" },
          { playerId: "W2", slot: "WR" as RosterSlot, platformPlayerId: "W2" },
        ] },
    ],
  });
  const seasonBlends = mkBlends({ R1: 200, R2: 180, W1: 190, W2: 60 });
  const vorMap = new Map(
    [["R1", 60], ["R2", 45], ["W1", 55], ["W2", 2]].map(([id, v]) => [
      id as string,
      { playerId: id as string, points: 0, vor: v as number, positionRank: 1, tier: 1 },
    ]),
  );

  it("accepts trading surplus RB depth for a starting WR upgrade", () => {
    // Give R2 (bench surplus), get W1 (huge WR upgrade over W2).
    const result = evaluateTrade({ league, give: ["R2"], get: ["W1"], seasonBlends, vor: vorMap, players });
    expect(result.verdict).toBe("accept");
    expect(result.lineupDelta).toBeCloseTo(130); // W1 190 replaces W2 60
  });

  it("rejects the reverse (giving the starter for nothing)", () => {
    const result = evaluateTrade({ league, give: ["R1"], get: [], seasonBlends, vor: vorMap, players });
    expect(result.verdict).toBe("reject");
  });
});

describe("findTrades", () => {
  const players = mkPlayers({ R1: "RB", R2: "RB", R3: "RB", W1: "WR", W2: "WR", W3: "WR" });
  const slots = { QB: 0, RB: 1, WR: 1, TE: 0, FLEX: 0, K: 0, DST: 0, BENCH: 3, IR: 0 } as Record<RosterSlot, number>;
  // Me: RB-rich (R1 starter, R2 near-equal bench), thin WR (W3).
  // Them: WR-rich (W1 starter, W2 near-equal bench), thin RB (R3).
  const league = mkLeague({
    myTeamId: "1",
    lineupSlots: slots,
    teams: [
      { id: "1", name: "Me", wins: 1, losses: 1, ties: 0, pointsFor: 0, pointsAgainst: 0,
        roster: [
          { playerId: "R1", slot: "RB" as RosterSlot, platformPlayerId: "R1" },
          { playerId: "R2", slot: "BENCH" as RosterSlot, platformPlayerId: "R2" },
          { playerId: "W3", slot: "WR" as RosterSlot, platformPlayerId: "W3" },
        ] },
      { id: "2", name: "Them", wins: 0, losses: 2, ties: 0, pointsFor: 0, pointsAgainst: 0,
        roster: [
          { playerId: "W1", slot: "WR" as RosterSlot, platformPlayerId: "W1" },
          { playerId: "W2", slot: "BENCH" as RosterSlot, platformPlayerId: "W2" },
          { playerId: "R3", slot: "RB" as RosterSlot, platformPlayerId: "R3" },
        ] },
    ],
  });
  const seasonBlends = mkBlends({ R1: 200, R2: 190, R3: 80, W1: 195, W2: 185, W3: 70 });
  const vorMap = new Map(
    [["R1", 60], ["R2", 55], ["R3", 5], ["W1", 58], ["W2", 52], ["W3", 3]].map(([id, v]) => [
      id as string,
      { playerId: id as string, points: 0, vor: v as number, positionRank: 1, tier: 1 },
    ]),
  );

  it("finds the surplus-for-surplus swap that helps both sides", () => {
    const proposals = findTrades({ league, seasonBlends, vor: vorMap, players, mispricings: [] });
    expect(proposals.length).toBeGreaterThan(0);
    const best = proposals[0]!;
    expect(best.give).toEqual(["R2"]);
    expect(best.get).toEqual(["W2"]);
    expect(best.myLineupDelta).toBeGreaterThan(50);
    expect(best.theirLineupDelta).toBeGreaterThan(50);
  });
});

/* ---------- draft ---------- */

describe("draft tools", () => {
  const players = mkPlayers({ R1: "RB", R2: "RB", R3: "RB", R4: "RB", W1: "WR", W2: "WR", Q1: "QB" });
  players.get("R1")!.searchRank = 5; // market sleeps on R1? no — market rank 5
  players.get("W1")!.searchRank = 1;
  const league = mkLeague({
    lineupSlots: { QB: 1, RB: 2, WR: 2, TE: 0, FLEX: 1, K: 0, DST: 0, BENCH: 4, IR: 0 } as Record<RosterSlot, number>,
    teams: [
      { id: "1", name: "A", wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, roster: [] },
      { id: "2", name: "B", wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, roster: [] },
    ],
  });
  const blends = mkBlends({ R1: 260, R2: 255, R3: 150, R4: 140, W1: 240, W2: 130, Q1: 300 });

  it("builds a cheat sheet ordered by VOR with ADP value", () => {
    const vor = computeVor(league, blends, players);
    const sheet = buildCheatSheet(blends, vor, players, 10);
    expect(sheet[0]!.overallRank).toBe(1);
    expect(sheet.every((r, i) => i === 0 || r.vor <= sheet[i - 1]!.vor)).toBe(true);
    const w1 = sheet.find((r) => r.playerId === "W1")!;
    expect(w1.adp).toBe(1);
  });

  it("computes roster needs from picks so far", () => {
    const needs = rosterNeeds(league, ["R1", "R2"], players);
    expect(needs.RB).toBeGreaterThan(0); // targets RB depth beyond 2 starters
    expect(needs.QB).toBe(1);
  });

  it("urges the pick before a tier cliff", () => {
    const vor = computeVor(league, blends, players);
    const advice = bestAvailable({
      league, blends, vor, players,
      taken: new Set(["R1", "W1"]), myPicks: [], picksUntilNext: 8,
    });
    // R2 (255) is the last RB before the drop to 150 — should carry a cliff reason.
    const r2 = advice.find((a) => a.playerId === "R2")!;
    expect(r2.reasons.join(" ")).toMatch(/tier|cliff|points fall/i);
    expect(advice[0]!.playerId).toBe("R2");
  });
});
