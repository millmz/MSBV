import { fetchJson } from "../../http.js";
import type { Player, PlayerProjection, Position, TrendingPlayer } from "../../../core/types.js";
import { POSITIONS } from "../../../core/types.js";

const API = "https://api.sleeper.app/v1";
/** Projections live on a different (undocumented but stable) host. */
const PROJ_API = "https://api.sleeper.com";

type SleeperPlayerRaw = {
  player_id: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  fantasy_positions?: string[];
  team?: string | null;
  espn_id?: number | string | null;
  yahoo_id?: number | string | null;
  gsis_id?: string | null;
  injury_status?: string | null;
  age?: number | null;
  years_exp?: number | null;
  search_rank?: number | null;
  depth_chart_order?: number | null;
  active?: boolean;
};

/** Team DST entries in Sleeper have player_id like "KC" and position "DEF". */
function normalizePosition(raw: SleeperPlayerRaw): Position | undefined {
  const pos = raw.position ?? raw.fantasy_positions?.[0];
  if (pos === "DEF") return "DST";
  if (pos && (POSITIONS as string[]).includes(pos)) return pos as Position;
  return undefined;
}

export function normalizePlayers(
  raw: Record<string, SleeperPlayerRaw>,
  byeWeeks?: Record<string, number>,
): Player[] {
  const players: Player[] = [];
  for (const [id, p] of Object.entries(raw)) {
    const position = normalizePosition(p);
    if (!position) continue;
    // Keep DSTs and any active player; skip long-retired clutter.
    const isDst = position === "DST";
    if (!isDst && p.active === false) continue;
    const name = p.full_name ?? [p.first_name, p.last_name].filter(Boolean).join(" ");
    if (!name) continue;
    players.push({
      id,
      name,
      position,
      team: p.team ?? undefined,
      espnId: p.espn_id != null ? String(p.espn_id) : undefined,
      yahooId: p.yahoo_id != null ? String(p.yahoo_id) : undefined,
      gsisId: p.gsis_id ?? undefined,
      injuryStatus: p.injury_status ?? undefined,
      byeWeek: p.team ? byeWeeks?.[p.team] : undefined,
      age: p.age ?? undefined,
      yearsExp: p.years_exp ?? undefined,
      searchRank:
        p.search_rank != null && p.search_rank < 9_999_999 ? p.search_rank : undefined,
      depthChartOrder: p.depth_chart_order ?? undefined,
    });
  }
  return players;
}

export async function fetchPlayerUniverse(): Promise<Record<string, SleeperPlayerRaw>> {
  return fetchJson(`${API}/players/nfl`, { timeoutMs: 60_000 });
}

export async function fetchTrending(
  direction: "add" | "drop",
  limit = 100,
): Promise<TrendingPlayer[]> {
  const raw = await fetchJson<{ player_id: string; count: number }[]>(
    `${API}/players/nfl/trending/${direction}?lookback_hours=24&limit=${limit}`,
  );
  return raw.map((r) => ({ playerId: r.player_id, count: r.count, direction }));
}

type SleeperProjectionRaw = {
  player_id: string;
  stats?: Record<string, number>;
  week?: number | null;
};

const POS_QUERY = "position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF";

export function normalizeProjections(
  raw: SleeperProjectionRaw[],
  season: number,
  week: number,
): PlayerProjection[] {
  return raw
    .filter((r) => r.stats && Object.keys(r.stats).length > 0)
    .map((r) => ({
      playerId: r.player_id,
      source: "sleeper" as const,
      season,
      week,
      stats: r.stats!,
      defaultPoints: r.stats!.pts_ppr,
    }));
}

/** Weekly projections for one week (regular season). */
export async function fetchWeekProjections(season: number, week: number): Promise<PlayerProjection[]> {
  const raw = await fetchJson<SleeperProjectionRaw[]>(
    `${PROJ_API}/projections/nfl/${season}/${week}?season_type=regular&${POS_QUERY}&order_by=pts_ppr`,
    { timeoutMs: 30_000 },
  );
  return normalizeProjections(raw, season, week);
}

/** Full-season projections (week 0 in our model). */
export async function fetchSeasonProjections(season: number): Promise<PlayerProjection[]> {
  const raw = await fetchJson<SleeperProjectionRaw[]>(
    `${PROJ_API}/projections/nfl/${season}?season_type=regular&${POS_QUERY}&order_by=pts_ppr`,
    { timeoutMs: 30_000 },
  );
  return normalizeProjections(raw, season, 0);
}

/** Current NFL state: season year and week number. */
export async function fetchNflState(): Promise<{ season: number; week: number; seasonType: string }> {
  const raw = await fetchJson<{ season: string; week: number; season_type: string }>(
    `${API}/state/nfl`,
  );
  return { season: Number(raw.season), week: raw.week, seasonType: raw.season_type };
}
