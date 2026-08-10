import { describe, expect, it } from "vitest";
import type { Player } from "../../../core/types.js";
import { buildIndex } from "../../players.js";
import {
  yahooFreeAgentsFixture,
  yahooRosterFixture,
  yahooScoreboardFixture,
  yahooSettingsFixture,
  yahooStandingsFixture,
  yahooUserLeaguesFixture,
  yahooUserTeamsFixture,
} from "./fixture.js";
import {
  findMyTeamKey,
  leagueMeta,
  mapFreeAgentsPage,
  mapLineupSlots,
  mapRoster,
  mapScoreboard,
  mapScoring,
  mapStandingsTeams,
  mapUserLeagues,
  normalizeTeamAbbr,
} from "./map.js";

const universe: Player[] = [
  { id: "4046", name: "Patrick Mahomes", position: "QB", team: "KC", yahooId: "30123" },
  { id: "8228", name: "Jaylen Warren", position: "RB", team: "PIT", yahooId: "40400" },
  { id: "ARI", name: "Arizona Cardinals", position: "DST", team: "ARI" },
];
const index = buildIndex(universe);

describe("mapScoring", () => {
  it("maps stat modifiers to canonical keys and labels Half PPR", () => {
    const scoring = mapScoring(yahooSettingsFixture);
    expect(scoring.label).toBe("Half PPR");
    expect(scoring.perStat.pass_yd).toBeCloseTo(0.04);
    expect(scoring.perStat.rec).toBe(0.5);
    expect(scoring.perStat.fum_lost).toBe(-2);
    expect(scoring.perStat.def_sack).toBe(1);
    expect(scoring.perStat.pts_allow_0).toBe(10);
  });
});

describe("mapLineupSlots", () => {
  it("maps roster positions including FLEX and DEF→DST", () => {
    const slots = mapLineupSlots(yahooSettingsFixture);
    expect(slots.QB).toBe(1);
    expect(slots.WR).toBe(3);
    expect(slots.FLEX).toBe(1);
    expect(slots.DST).toBe(1);
    expect(slots.BENCH).toBe(5);
    expect(slots.IR).toBe(2);
  });
});

describe("league meta", () => {
  it("reads key, name, week from fragment 0", () => {
    const meta = leagueMeta(yahooSettingsFixture);
    expect(meta.league_key).toBe("461.l.777");
    expect(meta.name).toBe("Yahoo Bowl");
    expect(Number(meta.current_week)).toBe(3);
  });
});

describe("mapStandingsTeams", () => {
  it("maps records and points", () => {
    const teams = mapStandingsTeams(yahooStandingsFixture, index);
    expect(teams).toHaveLength(2);
    expect(teams[0]).toMatchObject({ id: "1", name: "Adam's Yahoo Squad", wins: 2 });
    expect(teams[0]!.pointsFor).toBeCloseTo(241.1);
    expect(teams[0]!.ownerName).toBe("Adam");
  });
});

describe("mapRoster", () => {
  it("resolves by yahoo_id, DEF by team, and tracks unmapped", () => {
    const { roster, unmapped } = mapRoster(yahooRosterFixture, index);
    expect(roster.map((r) => r.playerId)).toEqual(["4046", "ARI"]);
    expect(roster[0]!.slot).toBe("QB");
    expect(roster[1]!.slot).toBe("DST");
    expect(unmapped[0]!.name).toBe("Total Unknown");
  });
});

describe("mapScoreboard", () => {
  it("maps a week's matchups with scores", () => {
    const matchups = mapScoreboard(yahooScoreboardFixture);
    expect(matchups).toHaveLength(1);
    expect(matchups[0]).toMatchObject({ week: 3, homeTeamId: "1", awayTeamId: "2" });
    expect(matchups[0]!.homeScore).toBeCloseTo(88.4);
  });
});

describe("mapFreeAgentsPage", () => {
  it("maps FA entries with ownership and running rank", () => {
    const fas = mapFreeAgentsPage(yahooFreeAgentsFixture, index, 25);
    expect(fas).toHaveLength(1);
    expect(fas[0]).toMatchObject({ playerId: "8228", percentOwned: 55, platformRank: 26 });
  });
});

describe("user leagues + my team", () => {
  it("lists the login's leagues", () => {
    const leagues = mapUserLeagues(yahooUserLeaguesFixture);
    expect(leagues).toEqual([
      { leagueKey: "461.l.777", name: "Yahoo Bowl", scoringType: "head" },
    ]);
  });
  it("finds the login's team key in a league", () => {
    expect(findMyTeamKey(yahooUserTeamsFixture, "461.l.777")).toBe("461.l.777.t.1");
  });
});

describe("normalizeTeamAbbr", () => {
  it("uppercases and aliases", () => {
    expect(normalizeTeamAbbr("Ari")).toBe("ARI");
    expect(normalizeTeamAbbr("Jac")).toBe("JAX");
    expect(normalizeTeamAbbr("WSH")).toBe("WAS");
  });
});
