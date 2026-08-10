import type {
  FreeAgent,
  League,
  LeagueTeam,
  Matchup,
  Player,
  RosterSlot,
  ScoringRules,
} from "../../../core/types.js";
import type { PlayerIndex } from "../../players.js";
import { findByName } from "../../players.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

/**
 * ESPN statId → canonical (Sleeper-vocabulary) stat key(s). When one ESPN
 * bucket spans several canonical keys (e.g. FGs under 40 yards), the points
 * value is applied to each. Unknown ids are ignored.
 */
export const ESPN_STAT_MAP: Record<number, string | string[]> = {
  3: "pass_yd",
  4: "pass_td",
  19: "pass_2pt",
  20: "pass_int",
  24: "rush_yd",
  25: "rush_td",
  26: "rush_2pt",
  42: "rec_yd",
  43: "rec_td",
  44: "rec_2pt",
  53: "rec",
  72: "fum_lost",
  // Kicking
  74: "fgm_50p",
  77: "fgm_40_49",
  80: ["fgm_0_19", "fgm_20_29", "fgm_30_39"],
  85: "fgmiss",
  86: "xpm",
  88: "xpmiss",
  // DST
  89: "pts_allow_0",
  90: "pts_allow_1_6",
  91: "pts_allow_7_13",
  92: "pts_allow_14_20", // ESPN bracket is 14–17; closest canonical bucket
  95: "def_int",
  96: "def_fum_rec",
  97: "blk_kick",
  98: "def_td",
  99: "def_sack",
  103: "def_td", // fumble return TD
  104: "def_td", // interception return TD
  106: "def_safety",
  122: "pts_allow_21_27", // ESPN 22–27
  123: "pts_allow_28_34",
  124: "pts_allow_35p", // ESPN 35–45
  125: "pts_allow_35p", // ESPN 46+
};

const SLOT_MAP: Record<number, RosterSlot> = {
  0: "QB",
  2: "RB",
  3: "WRRB",
  4: "WR",
  6: "TE",
  7: "SUPERFLEX", // "OP"
  16: "DST",
  17: "K",
  20: "BENCH",
  21: "IR",
  23: "FLEX",
};

/** ESPN proTeamId → NFL abbreviation (Sleeper's vocabulary; WAS not WSH). */
export const ESPN_PRO_TEAMS: Record<number, string> = {
  1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET",
  9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN",
  17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC",
  25: "SF", 26: "SEA", 27: "TB", 28: "WAS", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU",
};

const ESPN_POSITIONS: Record<number, string> = {
  1: "QB",
  2: "RB",
  3: "WR",
  4: "TE",
  5: "K",
  16: "DST",
};

export function mapScoring(raw: Raw): ScoringRules {
  const items: Raw[] = raw?.settings?.scoringSettings?.scoringItems ?? [];
  const perStat: Record<string, number> = {};
  for (const item of items) {
    const keys = ESPN_STAT_MAP[item.statId];
    if (!keys || !item.points) continue;
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      // Don't overwrite (e.g. two ESPN brackets folding into pts_allow_35p keeps the first).
      if (!(key in perStat)) perStat[key] = item.points;
    }
  }
  const rec = perStat.rec ?? 0;
  const label = rec >= 1 ? "PPR" : rec >= 0.5 ? "Half PPR" : rec > 0 ? `${rec} PPR` : "Standard";
  return { perStat, label };
}

export function mapLineupSlots(raw: Raw): Record<RosterSlot, number> {
  const counts: Record<string, number> = raw?.settings?.rosterSettings?.lineupSlotCounts ?? {};
  const slots = {} as Record<RosterSlot, number>;
  for (const [idStr, count] of Object.entries(counts)) {
    const slot = SLOT_MAP[Number(idStr)];
    if (!slot || !count) continue;
    slots[slot] = (slots[slot] ?? 0) + Number(count);
  }
  return slots;
}

/**
 * Resolve an ESPN player to the canonical universe. D/ST "players" have
 * negative ids and no cross-id in Sleeper, so they resolve by team.
 */
export function resolveEspnPlayer(
  index: PlayerIndex,
  espnPlayer: Raw,
): Player | undefined {
  const espnId = espnPlayer?.id;
  if (espnId != null && espnId >= 0) {
    const byId = index.byEspnId.get(String(espnId));
    if (byId) return byId;
  }
  const position = ESPN_POSITIONS[espnPlayer?.defaultPositionId] ?? undefined;
  if (position === "DST") {
    const team = ESPN_PRO_TEAMS[espnPlayer?.proTeamId];
    if (team) {
      const dst = index.byId.get(team);
      if (dst) return dst;
    }
  }
  const name = espnPlayer?.fullName;
  if (!name) return undefined;
  const team = ESPN_PRO_TEAMS[espnPlayer?.proTeamId];
  return findByName(index, name, position, team);
}

function mapTeams(raw: Raw, index: PlayerIndex): LeagueTeam[] {
  const teams: Raw[] = raw?.teams ?? [];
  return teams.map((t) => {
    const roster: LeagueTeam["roster"] = [];
    const unmapped: LeagueTeam["unmapped"] = [];
    for (const entry of t?.roster?.entries ?? []) {
      const espnPlayer = entry?.playerPoolEntry?.player;
      const slot = SLOT_MAP[entry?.lineupSlotId] ?? "BENCH";
      const player = resolveEspnPlayer(index, espnPlayer);
      if (player) {
        roster.push({ playerId: player.id, slot, platformPlayerId: String(espnPlayer?.id) });
      } else if (espnPlayer?.fullName) {
        unmapped.push({ platformPlayerId: String(espnPlayer?.id), name: espnPlayer.fullName });
      }
    }
    const record = t?.record?.overall ?? {};
    const name = t?.name ?? [t?.location, t?.nickname].filter(Boolean).join(" ") ?? `Team ${t?.id}`;
    return {
      id: String(t?.id),
      name,
      ownerName: undefined,
      wins: record.wins ?? 0,
      losses: record.losses ?? 0,
      ties: record.ties ?? 0,
      pointsFor: record.pointsFor ?? 0,
      pointsAgainst: record.pointsAgainst ?? 0,
      roster,
      unmapped: unmapped.length > 0 ? unmapped : undefined,
    };
  });
}

function mapMatchups(raw: Raw): Matchup[] {
  const schedule: Raw[] = raw?.schedule ?? [];
  return schedule
    .filter((m) => m?.home && m?.away)
    .map((m) => ({
      week: m.matchupPeriodId,
      homeTeamId: String(m.home.teamId),
      awayTeamId: String(m.away.teamId),
      homeScore: m.home.totalPoints || undefined,
      awayScore: m.away.totalPoints || undefined,
    }));
}

/** Find my team by matching the SWID cookie against team owner GUIDs. */
export function findMyTeamId(raw: Raw, swid?: string): string | undefined {
  if (!swid) return undefined;
  const normalized = swid.replace(/[{}]/g, "").toLowerCase();
  for (const t of raw?.teams ?? []) {
    for (const owner of t?.owners ?? []) {
      if (String(owner).replace(/[{}]/g, "").toLowerCase() === normalized) {
        return String(t.id);
      }
    }
  }
  return undefined;
}

export function mapEspnLeague(
  raw: Raw,
  index: PlayerIndex,
  season: number,
  opts: { swid?: string; myTeamId?: number } = {},
): League {
  const currentWeek =
    raw?.status?.currentMatchupPeriod ?? raw?.scoringPeriodId ?? 1;
  return {
    id: `espn:${raw?.id ?? ""}`,
    platform: "espn",
    platformLeagueId: String(raw?.id ?? ""),
    name: raw?.settings?.name ?? "ESPN League",
    season,
    currentWeek,
    scoring: mapScoring(raw),
    lineupSlots: mapLineupSlots(raw),
    teams: mapTeams(raw, index),
    myTeamId:
      opts.myTeamId !== undefined ? String(opts.myTeamId) : findMyTeamId(raw, opts.swid),
    matchups: mapMatchups(raw),
    freeAgents: [], // filled from the player pool below
    playoffWeekStart: raw?.settings?.scheduleSettings?.matchupPeriodCount
      ? raw.settings.scheduleSettings.matchupPeriodCount + 1
      : undefined,
    syncedAt: new Date().toISOString(),
  };
}

export type EspnPoolEntry = {
  playerId: string; // canonical
  espnId: string;
  onTeamId: number;
  percentOwned?: number;
  platformRank?: number;
  /** ESPN's projected points for the current scoring period (statSourceId 1). */
  projectedPoints?: number;
  /** ESPN's projected season total when present. */
  projectedSeasonPoints?: number;
};

export function mapPlayerPool(
  raw: Raw,
  index: PlayerIndex,
  scoringPeriodId: number,
  season: number,
): EspnPoolEntry[] {
  const players: Raw[] = raw?.players ?? [];
  const out: EspnPoolEntry[] = [];
  for (const entry of players) {
    const espnPlayer = entry?.player ?? entry;
    const player = resolveEspnPlayer(index, espnPlayer);
    if (!player) continue;
    let projectedPoints: number | undefined;
    let projectedSeasonPoints: number | undefined;
    for (const s of espnPlayer?.stats ?? []) {
      if (s?.statSourceId !== 1) continue; // 1 = projection, 0 = actual
      if (s?.scoringPeriodId === scoringPeriodId && s?.seasonId === season) {
        projectedPoints = s?.appliedTotal ?? undefined;
      }
      if (s?.scoringPeriodId === 0 && s?.seasonId === season) {
        projectedSeasonPoints = s?.appliedTotal ?? undefined;
      }
    }
    const rank =
      espnPlayer?.draftRanksByRankType?.PPR?.rank ??
      espnPlayer?.draftRanksByRankType?.STANDARD?.rank ??
      undefined;
    out.push({
      playerId: player.id,
      espnId: String(espnPlayer?.id),
      onTeamId: entry?.onTeamId ?? 0,
      percentOwned: espnPlayer?.ownership?.percentOwned ?? undefined,
      platformRank: rank,
      projectedPoints,
      projectedSeasonPoints,
    });
  }
  return out;
}

export function poolToFreeAgents(pool: EspnPoolEntry[], rostered: Set<string>): FreeAgent[] {
  return pool
    .filter((p) => p.onTeamId === 0 && !rostered.has(p.playerId))
    .map((p) => ({
      playerId: p.playerId,
      platformPlayerId: p.espnId,
      percentOwned: p.percentOwned,
      platformRank: p.platformRank,
      platformProjection: p.projectedPoints ?? p.projectedSeasonPoints,
    }));
}

/** Bye weeks by NFL team abbreviation, from the pro-team schedules view. */
export function mapByeWeeks(raw: Raw): Record<string, number> {
  const byes: Record<string, number> = {};
  const teams: Raw[] = raw?.settings?.proTeams ?? [];
  for (const t of teams) {
    const abbrev = ESPN_PRO_TEAMS[t?.id];
    if (abbrev && t?.byeWeek) byes[abbrev] = t.byeWeek;
  }
  return byes;
}
