import { describe, expect, it } from "vitest";
import { normalizeUsage } from "./client.js";
import { parseCsv } from "../../csv.js";

const csv = [
  "player_id,player_display_name,position,season,week,season_type,team,targets,receptions,carries,attempts,rushing_yards,rushing_tds,receiving_yards,receiving_tds,target_share,air_yards_share,fantasy_points,fantasy_points_ppr",
  "00-0033873,Patrick Mahomes,QB,2025,1,REG,KC,,,2,38,12,0,,,,,18.2,18.2",
  "00-0036322,Justin Jefferson,WR,2025,1,REG,MIN,11,8,0,,0,0,133,1,0.31,0.42,19.3,27.3",
  "00-0036322,Justin Jefferson,WR,2025,19,POST,MIN,9,6,0,,0,0,90,0,0.28,0.38,15.0,21.0",
  "00-0099999,Some Guard,G,2025,1,REG,KC,,,,,,,,,,,0,0",
].join("\n");

describe("normalizeUsage", () => {
  it("keeps REG-season skill players with usage fields", () => {
    const rows = normalizeUsage(parseCsv(csv));
    expect(rows).toHaveLength(2);
    const jj = rows.find((r) => r.gsisId === "00-0036322")!;
    expect(jj.week).toBe(1);
    expect(jj.targets).toBe(11);
    expect(jj.targetShare).toBeCloseTo(0.31);
    expect(jj.recTds).toBe(1);
    expect(jj.fantasyPointsPpr).toBeCloseTo(27.3);
  });

  it("treats NA and empty as undefined", () => {
    const rows = normalizeUsage(
      parseCsv(
        "player_id,position,week,season_type,team,targets,target_share\n00-1,RB,2,REG,KC,NA,\n",
      ),
    );
    expect(rows[0]!.targets).toBeUndefined();
    expect(rows[0]!.targetShare).toBeUndefined();
  });
});
