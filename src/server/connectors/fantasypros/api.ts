import { getConfig } from "../../config.js";
import { fetchJson, HttpError } from "../../http.js";
import type { FpProjectionRow, FpRankingRow } from "./parse.js";

/**
 * Official FantasyPros API (api.fantasypros.com/v2, x-api-key auth).
 * When a key is configured this is the primary FantasyPros pipeline —
 * consensus rankings (draft / weekly / ROS) and stat projections — and the
 * page-scrape client is only the keyless fallback.
 */

const BASE = "https://api.fantasypros.com/v2/json/nfl";

const SCORING_PARAM: Record<string, string> = { ppr: "PPR", half: "HALF", std: "STD" };
const PROJECTION_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DST"];

export function fpApiKey(): string {
  return getConfig().fantasypros.apiKey;
}

function headers(): Record<string, string> {
  return { "x-api-key": fpApiKey(), Accept: "application/json" };
}

type ApiRankedPlayer = {
  player_name?: string;
  player_team_id?: string;
  player_position_id?: string;
  rank_ecr?: number;
  tier?: number;
};

type ApiProjectedPlayer = {
  name?: string;
  player_name?: string;
  team_id?: string;
  player_team_id?: string;
  fpts?: number | string;
  stats?: { points?: number | string };
};

export function mapApiRankings(data: { players?: ApiRankedPlayer[] }): FpRankingRow[] {
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

export function mapApiProjections(
  data: { players?: ApiProjectedPlayer[] },
  position: string,
): FpProjectionRow[] {
  const out: FpProjectionRow[] = [];
  for (const p of data.players ?? []) {
    const name = p.player_name ?? p.name;
    const points = Number.parseFloat(String(p.fpts ?? p.stats?.points ?? ""));
    if (!name || !Number.isFinite(points)) continue;
    out.push({
      name,
      team: p.player_team_id ?? p.team_id ?? undefined,
      position: position.toUpperCase(),
      points,
    });
  }
  return out;
}

/** type=draft|weekly|ros; week only meaningful for weekly. */
export async function fetchApiRankings(
  scoring: "ppr" | "half" | "std",
  type: "draft" | "weekly" | "ros",
  week = 0,
): Promise<FpRankingRow[]> {
  const { season } = getConfig();
  const params = new URLSearchParams({
    type,
    scoring: SCORING_PARAM[scoring]!,
    position: "ALL",
    week: String(type === "weekly" ? week : 0),
    experts: "available",
  });
  const data = await fetchJson<{ players?: ApiRankedPlayer[] }>(
    `${BASE}/${season}/consensus-rankings?${params}`,
    { headers: headers(), timeoutMs: 20_000 },
  );
  return mapApiRankings(data);
}

export async function fetchApiProjections(
  scoring: "ppr" | "half" | "std",
  week: number | "draft" = "draft",
): Promise<FpProjectionRow[]> {
  const { season } = getConfig();
  const out: FpProjectionRow[] = [];
  let auth: HttpError | undefined;
  for (const pos of PROJECTION_POSITIONS) {
    const params = new URLSearchParams({
      position: pos,
      scoring: SCORING_PARAM[scoring]!,
      week: String(week === "draft" ? 0 : week),
    });
    try {
      const data = await fetchJson<{ players?: ApiProjectedPlayer[] }>(
        `${BASE}/${season}/projections?${params}`,
        { headers: headers(), timeoutMs: 20_000 },
      );
      out.push(...mapApiProjections(data, pos));
    } catch (err) {
      if (err instanceof HttpError && (err.status === 401 || err.status === 403)) auth = err;
      // otherwise: partial coverage is fine
    }
  }
  if (out.length === 0 && auth) throw auth;
  return out;
}
