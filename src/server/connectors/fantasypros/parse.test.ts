import { describe, expect, it } from "vitest";
import { detectFpKind, parseFpProjections, parseFpRankings } from "./parse.js";

const RANKINGS_CSV = `"RK","TIERS","PLAYER NAME","TEAM","POS","BYE WEEK","SOS SEASON","ECR VS. ADP"
"1","1","Ja'Marr Chase","CIN","WR1","10","3 out of 5 stars","0"
"2","1","Bijan Robinson","ATL","RB1","5","4 out of 5 stars","+1"
"3","2","CeeDee Lamb","DAL","WR2","7","2 out of 5 stars","-1"`;

// Real projections exports repeat stat headers (rush YDS vs rec YDS) — only
// Player/Team/FPTS need to survive that collision.
const PROJECTIONS_CSV = `Player,Team,ATT,YDS,TDS,REC,YDS,TDS,FL,FPTS
Bijan Robinson,ATL,289.5,1387.4,11.2,58.1,489.2,2.9,1.9,331.9
Jahmyr Gibbs,DET,241.0,"1,203.7",10.4,52.3,410.8,2.1,1.5,301.2`;

describe("detectFpKind", () => {
  it("recognizes both export shapes", () => {
    expect(detectFpKind(RANKINGS_CSV)).toBe("rankings");
    expect(detectFpKind(PROJECTIONS_CSV)).toBe("projections");
    expect(detectFpKind("a,b\n1,2")).toBeUndefined();
  });
});

describe("parseFpRankings", () => {
  it("parses rank, tier, and strips the rank digits from POS", () => {
    const rows = parseFpRankings(RANKINGS_CSV);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      name: "Ja'Marr Chase",
      team: "CIN",
      position: "WR",
      rank: 1,
      tier: 1,
    });
    expect(rows[2]!.tier).toBe(2);
  });
});

describe("parseFpProjections", () => {
  it("parses FPTS and tolerates duplicate stat headers + thousands commas", () => {
    const rows = parseFpProjections(PROJECTIONS_CSV);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: "Bijan Robinson", team: "ATL", points: 331.9 });
    expect(rows[1]!.points).toBe(301.2);
  });
});
