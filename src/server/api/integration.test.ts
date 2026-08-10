import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { League, Player, PlayerProjection, RosterSlot } from "../../core/types.js";
import { buildApp } from "../app.js";
import { storeSet } from "../store.js";

/**
 * End-to-end through the real app: seed the JSON store with a small but
 * complete world (players, projections, a synced ESPN league), then hit
 * every league endpoint.
 */

const players: Player[] = [
  { id: "q1", name: "Ace Quarterback", position: "QB", team: "KC" },
  { id: "q2", name: "Backup Quarterback", position: "QB", team: "CHI" },
  { id: "r1", name: "Bell Cow", position: "RB", team: "SF" },
  { id: "r2", name: "Committee Back", position: "RB", team: "DET" },
  { id: "r3", name: "Handcuff Back", position: "RB", team: "SF" },
  { id: "w1", name: "Alpha Receiver", position: "WR", team: "MIN" },
  { id: "w2", name: "Deep Threat", position: "WR", team: "MIA" },
  { id: "w3", name: "Slot Machine", position: "WR", team: "LAR" },
  { id: "t1", name: "Touchdown Tightend", position: "TE", team: "KC" },
  { id: "t2", name: "Streamer Tightend", position: "TE", team: "NYJ" },
  { id: "fa1", name: "Wire Gem", position: "RB", team: "TEN" },
  { id: "fa2", name: "Wire Receiver", position: "WR", team: "NO" },
];

const proj = (playerId: string, week: number, pts: number): PlayerProjection => ({
  playerId,
  source: "sleeper",
  season: 2026,
  week,
  // rec_yd 0.1/yd in the fixture league's scoring → pts as pure yardage.
  stats: { rec_yd: pts * 10 },
  defaultPoints: pts,
});

const roster = (entries: [string, RosterSlot][]) =>
  entries.map(([playerId, slot]) => ({ playerId, slot, platformPlayerId: playerId }));

const league: League = {
  id: "espn:99",
  platform: "espn",
  platformLeagueId: "99",
  name: "Integration Bowl",
  season: 2026,
  currentWeek: 3,
  scoring: { label: "PPR", perStat: { rec: 1, rec_yd: 0.1 } },
  lineupSlots: { QB: 1, RB: 1, WR: 1, TE: 1, FLEX: 1, K: 0, DST: 0, BENCH: 4, IR: 0 } as League["lineupSlots"],
  myTeamId: "1",
  teams: [
    {
      id: "1", name: "My Team", wins: 2, losses: 0, ties: 0, pointsFor: 240, pointsAgainst: 200,
      roster: roster([
        ["q1", "QB"], ["r1", "RB"], ["w1", "WR"], ["t1", "TE"], ["w2", "FLEX"], ["r3", "BENCH"], ["t2", "BENCH"],
      ]),
    },
    {
      id: "2", name: "Rival", wins: 0, losses: 2, ties: 0, pointsFor: 180, pointsAgainst: 220,
      roster: roster([["q2", "QB"], ["r2", "RB"], ["w3", "WR"]]),
    },
  ],
  matchups: [{ week: 3, homeTeamId: "1", awayTeamId: "2" }],
  freeAgents: [
    { playerId: "fa1", platformPlayerId: "fa1", percentOwned: 40, platformRank: 60 },
    { playerId: "fa2", platformPlayerId: "fa2", percentOwned: 20, platformRank: 80 },
  ],
  syncedAt: new Date().toISOString(),
};

let app: FastifyInstance;

beforeAll(async () => {
  storeSet("players", players);
  storeSet("nfl_state", { season: 2026, week: 3, seasonType: "regular" });
  const season: PlayerProjection[] = [
    proj("q1", 0, 320), proj("q2", 0, 250), proj("r1", 0, 260), proj("r2", 0, 200),
    proj("r3", 0, 90), proj("w1", 0, 250), proj("w2", 0, 180), proj("w3", 0, 170),
    proj("t1", 0, 160), proj("t2", 0, 80), proj("fa1", 0, 150), proj("fa2", 0, 60),
  ];
  const week: PlayerProjection[] = [
    proj("q1", 3, 21), proj("q2", 3, 16), proj("r1", 3, 17), proj("r2", 3, 13),
    proj("r3", 3, 6), proj("w1", 3, 16), proj("w2", 3, 11), proj("w3", 3, 11),
    proj("t1", 3, 10), proj("t2", 3, 7), proj("fa1", 3, 10), proj("fa2", 3, 4),
  ];
  storeSet("projections_2026_0", season);
  storeSet("projections_2026_3", week);
  storeSet("league_espn", league);
  storeSet("trending", [{ playerId: "fa1", count: 9000, direction: "add" }]);
  app = await buildApp();
});

afterAll(() => {
  rmSync(".test-data", { recursive: true, force: true });
});

describe("league API end-to-end", () => {
  it("lists the synced league", async () => {
    const res = await app.inject({ method: "GET", url: "/api/leagues" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { leagues: { id: string; myTeamName?: string }[] };
    expect(body.leagues[0]).toMatchObject({ id: "espn:99", myTeamName: "My Team" });
  });

  it("overview: favored posture and standings", async () => {
    const res = await app.inject({ method: "GET", url: "/api/league/espn:99/overview" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.myTeam.record).toBe("2-0");
    expect(body.opponent.name).toBe("Rival");
    expect(body.gameState.posture).toBe("favored");
    expect(body.standings[0].name).toBe("My Team");
  });

  it("lineup: fills all slots from the roster", async () => {
    const res = await app.inject({ method: "GET", url: "/api/league/espn:99/lineup" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.lineup).toHaveLength(5); // QB RB WR TE FLEX
    expect(body.lineup.map((p: { slot: string }) => p.slot)).toContain("FLEX");
    expect(body.totals.points).toBeGreaterThan(60);
  });

  it("waivers: surfaces the trending wire gem with reasons and a drop", async () => {
    const res = await app.inject({ method: "GET", url: "/api/league/espn:99/waivers" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const top = body.targets[0];
    expect(top.id).toBe("fa1");
    expect(top.reasons.join(" ")).toMatch(/Sleeper adds/);
    expect(body.streams.some((s: { position: string }) => s.position === "TE")).toBe(false); // t2 rostered, no TE FA
  });

  it("trade evaluate: judges a lopsided trade correctly", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/league/espn:99/trade/evaluate",
      payload: { give: ["r3"], get: ["r2"] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.verdict).toBe("accept"); // handcuff for a real starter
  });

  it("edge: returns the report shape", async () => {
    const res = await app.inject({ method: "GET", url: "/api/league/espn:99/edge" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.mispricings)).toBe(true);
    expect(Array.isArray(body.regression)).toBe(true);
    expect(Array.isArray(body.volatile)).toBe(true);
  });

  it("league player search scopes to the league context", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/league/espn:99/players/search?q=wire",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.players.map((p: { id: string }) => p.id)).toContain("fa1");
  });
});
