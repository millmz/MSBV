import { fetchText } from "../../http.js";
import { parseCsv } from "../../csv.js";
import type { UsageWeek } from "../../../core/types.js";

/**
 * nflverse publishes play-by-play-derived weekly player stats as CSVs on
 * GitHub releases. The file naming has changed across years, so we try the
 * known candidates in order.
 */
const BASE = "https://github.com/nflverse/nflverse-data/releases/download";

function candidateUrls(season: number): string[] {
  return [
    `${BASE}/stats_player/stats_player_week_${season}.csv`, // current naming (verified)
    `${BASE}/player_stats/player_stats_${season}.csv`, // legacy naming
  ];
}

const num = (s: string | undefined): number | undefined => {
  if (s === undefined || s === "" || s === "NA") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

export function normalizeUsage(rows: Record<string, string>[]): UsageWeek[] {
  const out: UsageWeek[] = [];
  for (const r of rows) {
    const gsisId = r.player_id ?? r.gsis_id;
    const week = num(r.week);
    if (!gsisId || week === undefined) continue;
    const seasonType = r.season_type ?? "REG";
    if (seasonType !== "REG") continue;
    const position = r.position ?? r.position_group ?? "";
    if (!["QB", "RB", "WR", "TE"].includes(position)) continue;
    out.push({
      gsisId,
      week,
      team: r.team || r.recent_team || undefined,
      targets: num(r.targets),
      receptions: num(r.receptions),
      carries: num(r.carries),
      passAttempts: num(r.attempts),
      rushYards: num(r.rushing_yards),
      recYards: num(r.receiving_yards),
      rushTds: num(r.rushing_tds),
      recTds: num(r.receiving_tds),
      targetShare: num(r.target_share),
      airYardsShare: num(r.air_yards_share),
      fantasyPointsPpr: num(r.fantasy_points_ppr),
      fantasyPointsStd: num(r.fantasy_points),
    });
  }
  return out;
}

export async function fetchSeasonUsage(season: number): Promise<UsageWeek[]> {
  let lastError: unknown;
  for (const url of candidateUrls(season)) {
    try {
      const text = await fetchText(url, { timeoutMs: 120_000 });
      const rows = normalizeUsage(parseCsv(text));
      if (rows.length > 0) return rows;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error(`no nflverse stats found for ${season}`);
}
