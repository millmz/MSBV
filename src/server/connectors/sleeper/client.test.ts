import { describe, expect, it } from "vitest";
import { normalizePlayers, normalizeProjections } from "./client.js";

describe("normalizePlayers", () => {
  const raw = {
    "4046": {
      player_id: "4046",
      full_name: "Patrick Mahomes",
      position: "QB",
      team: "KC",
      espn_id: 3139477,
      yahoo_id: 30123,
      gsis_id: "00-0033873",
      active: true,
      search_rank: 25,
      injury_status: null,
    },
    KC: {
      player_id: "KC",
      position: "DEF",
      first_name: "Kansas City",
      last_name: "Chiefs",
      team: "KC",
      active: true,
    },
    "9999": {
      player_id: "9999",
      full_name: "Retired Guy",
      position: "RB",
      team: null,
      active: false,
    },
    "1111": {
      player_id: "1111",
      full_name: "Long Snapper",
      position: "LS",
      team: "KC",
      active: true,
    },
  } as never;

  it("keeps fantasy positions, maps DEF→DST, drops inactive and irrelevant", () => {
    const players = normalizePlayers(raw);
    expect(players.map((p) => p.id).sort()).toEqual(["4046", "KC"]);
    const mahomes = players.find((p) => p.id === "4046")!;
    expect(mahomes.espnId).toBe("3139477");
    expect(mahomes.yahooId).toBe("30123");
    expect(mahomes.gsisId).toBe("00-0033873");
    const dst = players.find((p) => p.id === "KC")!;
    expect(dst.position).toBe("DST");
    expect(dst.name).toBe("Kansas City Chiefs");
  });
});

describe("normalizeProjections", () => {
  it("keeps stat lines and tags season/week/source", () => {
    const projections = normalizeProjections(
      [
        { player_id: "4046", stats: { pass_yd: 4800, pass_td: 38, pts_ppr: 380.5 } },
        { player_id: "0000", stats: {} },
      ],
      2026,
      0,
    );
    expect(projections).toHaveLength(1);
    expect(projections[0]).toMatchObject({
      playerId: "4046",
      source: "sleeper",
      season: 2026,
      week: 0,
      defaultPoints: 380.5,
    });
  });
});
