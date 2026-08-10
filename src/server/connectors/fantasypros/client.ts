import { fetchText } from "../../http.js";
import type { FpProjectionRow, FpRankingRow } from "./parse.js";

/**
 * Automatic FantasyPros pull — the same data the CSV exports contain, taken
 * from the endpoints the fantasypros.com pages themselves use:
 *  - cheat-sheet pages embed the full ECR dataset as a `var ecrData = {...}`
 *    JSON blob in the HTML;
 *  - projection pages serve their table as a tab-separated download via
 *    `?export=xls`.
 * Standard scorings (ppr/half/std) are served without a login; custom-scoring
 * data still arrives via the manual CSV upload, which always outranks this.
 */

const BASE = "https://www.fantasypros.com/nfl";

/** FantasyPros rejects generic client UAs on some CDN configs. */
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
};

const RANKINGS_PAGES: Record<string, string> = {
  ppr: "ppr-cheatsheets.php",
  half: "half-point-ppr-cheatsheets.php",
  std: "consensus-cheatsheets.php",
};

const PROJECTION_SCORING_PARAM: Record<string, string> = {
  ppr: "PPR",
  half: "HALF",
  std: "STD",
};

const PROJECTION_POSITIONS = ["qb", "rb", "wr", "te", "k", "dst"];

type EcrPlayer = {
  player_name?: string;
  player_team_id?: string;
  player_position_id?: string;
  rank_ecr?: number;
  tier?: number;
};

/** Extract the `var ecrData = {...};` blob a cheat-sheet page embeds. */
export function parseEcrHtml(html: string): FpRankingRow[] {
  const match = html.match(/var\s+ecrData\s*=\s*(\{[\s\S]*?\});/);
  if (!match) return [];
  let data: { players?: EcrPlayer[] };
  try {
    data = JSON.parse(match[1]!) as { players?: EcrPlayer[] };
  } catch {
    return [];
  }
  const out: FpRankingRow[] = [];
  for (const p of data.players ?? []) {
    if (!p.player_name || !Number.isFinite(p.rank_ecr)) continue;
    out.push({
      name: p.player_name,
      team: p.player_team_id || undefined,
      position: p.player_position_id?.replace(/\d+$/, "") || undefined,
      rank: p.rank_ecr!,
      tier: Number.isFinite(p.tier) ? p.tier : undefined,
    });
  }
  return out;
}

/**
 * Parse the `?export=xls` download: a title line, a blank line, then a
 * tab-separated table whose header includes Player and FPTS.
 */
export function parseProjectionsXls(text: string, position?: string): FpProjectionRow[] {
  const lines = text.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => {
    const cells = l.split("\t").map((c) => c.trim().toLowerCase());
    return cells.includes("player") && cells.includes("fpts");
  });
  if (headerIdx === -1) return [];
  const header = lines[headerIdx]!.split("\t").map((c) => c.trim().toLowerCase());
  const nameCol = header.indexOf("player");
  const teamCol = header.indexOf("team");
  const fptsCol = header.indexOf("fpts");

  const out: FpProjectionRow[] = [];
  for (const line of lines.slice(headerIdx + 1)) {
    const cells = line.split("\t").map((c) => c.trim().replaceAll('"', ""));
    const name = cells[nameCol];
    const points = Number.parseFloat((cells[fptsCol] ?? "").replace(/,/g, ""));
    if (!name || !Number.isFinite(points)) continue;
    out.push({
      name,
      team: teamCol >= 0 ? cells[teamCol] || undefined : undefined,
      position: position?.toUpperCase(),
      points,
    });
  }
  return out;
}

export async function fetchAutoRankings(scoring: "ppr" | "half" | "std"): Promise<FpRankingRow[]> {
  const page = RANKINGS_PAGES[scoring]!;
  const html = await fetchText(`${BASE}/rankings/${page}`, {
    headers: BROWSER_HEADERS,
    timeoutMs: 20_000,
  });
  return parseEcrHtml(html);
}

export async function fetchAutoProjections(
  scoring: "ppr" | "half" | "std",
): Promise<FpProjectionRow[]> {
  const out: FpProjectionRow[] = [];
  for (const pos of PROJECTION_POSITIONS) {
    try {
      const text = await fetchText(
        `${BASE}/projections/${pos}.php?week=draft&scoring=${PROJECTION_SCORING_PARAM[scoring]}&export=xls`,
        { headers: BROWSER_HEADERS, timeoutMs: 20_000 },
      );
      out.push(...parseProjectionsXls(text, pos));
    } catch {
      // per-position failures are tolerable — partial data still blends
    }
  }
  return out;
}
