import type { League, TierChart } from "../../core/types.js";
import type { EspnPoolEntry } from "../connectors/espn/map.js";
import { getConfig } from "../config.js";
import { getLeague } from "../leagues.js";
import { getPlayerIndex } from "../players.js";
import { storeGet } from "../store.js";
import { getNflWeek } from "../sync/spine.js";
import type { BlendMap } from "./blend.js";
import { computeBlends } from "./blend.js";
import { computeMispricings, type Mispricing } from "./mispricing.js";
import { computeUsageInsights, type UsageInsight } from "./usage.js";
import { computeVor, type VorEntry } from "./vor.js";
import type { PlayerProjection, TrendingPlayer, UsageWeek, Player } from "../../core/types.js";

/**
 * Assembles everything the engine needs for one league: blends in that
 * league's scoring, VOR, usage insights, mispricings. Recomputed on demand;
 * inputs all come from the synced snapshots.
 */

export type LeagueContext = {
  league: League;
  players: Map<string, Player>;
  seasonBlends: BlendMap;
  weekBlends: BlendMap;
  vor: Map<string, VorEntry>;
  usage: Map<string, UsageInsight>;
  mispricings: Mispricing[];
  trending: TrendingPlayer[];
  tierCharts: TierChart[];
  week: number;
};

export function buildLeagueContext(leagueId: string): LeagueContext | undefined {
  const league = getLeague(leagueId);
  if (!league) return undefined;
  const index = getPlayerIndex();
  const players = index.byId;
  const config = getConfig();
  const { week } = getNflWeek();

  const seasonProj = storeGet<PlayerProjection[]>(`projections_${config.season}_0`) ?? [];
  const weekProj =
    week > 0 ? (storeGet<PlayerProjection[]>(`projections_${config.season}_${week}`) ?? []) : [];

  // Platform projections & ranks (ESPN pool is rich; Yahoo has FA ranks only).
  const platformSeason = new Map<string, number>();
  const platformWeek = new Map<string, number>();
  const platformRanks = new Map<string, number>();
  if (league.platform === "espn") {
    const pool = storeGet<EspnPoolEntry[]>("espn_pool") ?? [];
    for (const entry of pool) {
      if (entry.projectedSeasonPoints) platformSeason.set(entry.playerId, entry.projectedSeasonPoints);
      if (entry.projectedPoints) platformWeek.set(entry.playerId, entry.projectedPoints);
      if (entry.platformRank) platformRanks.set(entry.playerId, entry.platformRank);
    }
  } else {
    for (const fa of league.freeAgents) {
      if (fa.platformRank) platformRanks.set(fa.playerId, fa.platformRank);
    }
  }

  const seasonBlends = computeBlends({
    players,
    sleeperProjections: seasonProj,
    platformProjections: platformSeason.size ? platformSeason : undefined,
    rules: league.scoring,
  });
  const weekBlends = computeBlends({
    players,
    sleeperProjections: weekProj,
    platformProjections: platformWeek.size ? platformWeek : undefined,
    rules: league.scoring,
  });

  const vor = computeVor(league, seasonBlends, players);

  const usageSeason = week > 0 ? config.season : config.season - 1;
  const usageRows =
    storeGet<UsageWeek[]>(`usage_${usageSeason}`) ??
    storeGet<UsageWeek[]>(`usage_${usageSeason - 1}`) ??
    [];
  const usage = computeUsageInsights(usageRows, players, index.byGsisId);

  const mispricings = computeMispricings(league, seasonBlends, players, platformRanks);

  const scoringKey =
    league.scoring.label === "PPR" ? "ppr" : league.scoring.label === "Half PPR" ? "half" : "std";
  const tierCharts = storeGet<TierChart[]>(`tiers_${scoringKey}`) ?? [];

  return {
    league,
    players,
    seasonBlends,
    weekBlends,
    vor,
    usage,
    mispricings,
    trending: storeGet<TrendingPlayer[]>("trending") ?? [],
    tierCharts,
    week,
  };
}
