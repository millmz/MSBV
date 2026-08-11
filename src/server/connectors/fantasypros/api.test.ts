import { describe, expect, it } from "vitest";
import { mapApiRankings, mapApiProjections } from "./api.js";

describe("mapApiRankings", () => {
  it("maps consensus-rankings players and strips ranked positions", () => {
    const rows = mapApiRankings({
      players: [
        { player_name: "Ja'Marr Chase", player_team_id: "CIN", player_position_id: "WR1", rank_ecr: 1, tier: 1 },
        { player_name: "49ers", player_team_id: "SF", player_position_id: "DST", rank_ecr: 120, tier: 1 },
        { player_name: "No Rank" },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: "Ja'Marr Chase", team: "CIN", position: "WR", rank: 1, tier: 1 });
    expect(rows[1]!.position).toBe("DST");
  });
});

describe("mapApiProjections", () => {
  it("accepts fpts at the top level or nested under stats, either name field", () => {
    const rows = mapApiProjections(
      {
        players: [
          { player_name: "Bijan Robinson", player_team_id: "ATL", fpts: 331.9 },
          { name: "Jahmyr Gibbs", team_id: "DET", stats: { points: "301.2" } },
          { player_name: "No Points" },
        ],
      },
      "rb",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: "Bijan Robinson", team: "ATL", position: "RB", points: 331.9 });
    expect(rows[1]!.points).toBe(301.2);
  });
});
