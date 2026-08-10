import { describe, expect, it } from "vitest";
import { parseEcrHtml, parseProjectionsXls } from "./client.js";

const ECR_HTML = `<html><head></head><body>
<script>
var someOther = 1;
var ecrData = {"sport":"NFL","year":"2026","players":[
  {"player_id":1,"player_name":"Ja'Marr Chase","player_team_id":"CIN","player_position_id":"WR","rank_ecr":1,"tier":1},
  {"player_id":2,"player_name":"Bijan Robinson","player_team_id":"ATL","player_position_id":"RB","rank_ecr":2,"tier":1},
  {"player_id":3,"player_name":"Nameless","rank_ecr":null}
]};
var after = true;
</script></body></html>`;

const XLS_EXPORT = [
  "FantasyPros Fantasy Football Projections (Draft)",
  "",
  "Player\tTeam\tATT\tYDS\tTDS\tREC\tYDS\tTDS\tFL\tFPTS",
  'Bijan Robinson\tATL\t289.5\t"1,387.4"\t11.2\t58.1\t489.2\t2.9\t1.9\t331.9',
  "Jahmyr Gibbs\tDET\t241.0\t1203.7\t10.4\t52.3\t410.8\t2.1\t1.5\t301.2",
  "",
].join("\n");

describe("parseEcrHtml", () => {
  it("extracts the embedded ecrData blob", () => {
    const rows = parseEcrHtml(ECR_HTML);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      name: "Ja'Marr Chase",
      team: "CIN",
      position: "WR",
      rank: 1,
      tier: 1,
    });
  });

  it("returns empty on pages without the blob", () => {
    expect(parseEcrHtml("<html>login required</html>")).toEqual([]);
  });
});

describe("parseProjectionsXls", () => {
  it("parses the tab-separated export past its title line", () => {
    const rows = parseProjectionsXls(XLS_EXPORT, "rb");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: "Bijan Robinson", team: "ATL", position: "RB", points: 331.9 });
  });
});
