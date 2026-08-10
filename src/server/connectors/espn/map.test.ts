import { describe, expect, it } from "vitest";
import type { Player } from "../../../core/types.js";
import { buildIndex } from "../../players.js";
import { espnLeagueFixture, espnPoolFixture, espnProTeamsFixture } from "./fixture.js";
import {
  mapByeWeeks,
  mapEspnLeague,
  mapPlayerPool,
  mapScoring,
  poolToFreeAgents,
} from "./map.js";

const universe: Player[] = [
  { id: "4046", name: "Patrick Mahomes", position: "QB", team: "KC", espnId: "3139477" },
  { id: "7564", name: "Ja'Marr Chase", position: "WR", team: "CIN", espnId: "4362628" },
  { id: "8228", name: "Jaylen Warren", position: "RB", team: "PIT", espnId: "4429795" },
  { id: "KC", name: "Kansas City Chiefs", position: "DST", team: "KC" },
];
const index = buildIndex(universe);

describe("mapScoring", () => {
  it("maps ESPN statIds to canonical keys and labels PPR", () => {
    const scoring = mapScoring(espnLeagueFixture);
    expect(scoring.label).toBe("PPR");
    expect(scoring.perStat.pass_yd).toBeCloseTo(0.04);
    expect(scoring.perStat.rec).toBe(1);
    expect(scoring.perStat.fgm_0_19).toBe(3); // under-40 bucket expanded
    expect(scoring.perStat.fgm_30_39).toBe(3);
    expect(scoring.perStat.def_sack).toBe(1);
  });
});

describe("mapEspnLeague", () => {
  const league = mapEspnLeague(espnLeagueFixture, index, 2026, { swid: "{adam-swid-guid}" });

  it("maps identity, week, and lineup slots", () => {
    expect(league.id).toBe("espn:12345");
    expect(league.name).toBe("Millman Bowl");
    expect(league.currentWeek).toBe(3);
    expect(league.lineupSlots.QB).toBe(1);
    expect(league.lineupSlots.FLEX).toBe(1);
    expect(league.lineupSlots.BENCH).toBe(7);
  });

  it("resolves rosters through ESPN ids, including D/ST by team", () => {
    const myTeam = league.teams.find((t) => t.id === "1")!;
    const ids = myTeam.roster.map((r) => r.playerId);
    expect(ids).toContain("4046");
    expect(ids).toContain("7564");
    expect(ids).toContain("KC"); // negative-id D/ST resolved via proTeamId
  });

  it("records unmappable players instead of dropping silently", () => {
    const other = league.teams.find((t) => t.id === "2")!;
    expect(other.unmapped?.[0]?.name).toBe("Unknown Rookie");
  });

  it("finds my team from the SWID cookie case-insensitively", () => {
    expect(league.myTeamId).toBe("1");
  });

  it("maps matchups with scores", () => {
    expect(league.matchups[0]).toMatchObject({ week: 1, homeTeamId: "1", homeScore: 120.2 });
  });
});

describe("player pool → free agents + mispricing inputs", () => {
  const pool = mapPlayerPool(espnPoolFixture, index, 3, 2026);

  it("extracts ESPN projections and ranks", () => {
    const mahomes = pool.find((p) => p.playerId === "4046")!;
    expect(mahomes.projectedPoints).toBeCloseTo(22.4);
    expect(mahomes.projectedSeasonPoints).toBeCloseTo(350.1);
    expect(mahomes.platformRank).toBe(20);
  });

  it("splits free agents from rostered players", () => {
    const fas = poolToFreeAgents(pool, new Set(["4046"]));
    expect(fas.map((f) => f.playerId)).toEqual(["8228"]);
    expect(fas[0]!.platformProjection).toBeCloseTo(11.7);
  });
});

describe("mapByeWeeks", () => {
  it("maps proTeamIds to NFL abbreviations (WAS not WSH)", () => {
    const byes = mapByeWeeks(espnProTeamsFixture);
    expect(byes.KC).toBe(10);
    expect(byes.WAS).toBe(14);
  });
});
