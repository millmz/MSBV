import { getConfig } from "../config.js";
import { storeAgeMs, storeSet, storeGet } from "../store.js";
import { registerSyncJob } from "./loop.js";
import {
  fetchNflState,
  fetchPlayerUniverse,
  fetchSeasonProjections,
  fetchTrending,
  fetchWeekProjections,
  normalizePlayers,
} from "../connectors/sleeper/client.js";
import { fetchSeasonUsage } from "../connectors/nflverse/client.js";
import { fetchAllTierCharts } from "../connectors/tiers/client.js";

const HOUR = 3_600_000;

/** Current week, from the last synced NFL state (0 → preseason/unknown). */
export function getNflWeek(): { season: number; week: number } {
  const state = storeGet<{ season: number; week: number; seasonType: string }>("nfl_state");
  const config = getConfig();
  const week = state && state.seasonType === "regular" ? state.week : 0;
  return { season: config.season, week };
}

export function registerSpineJobs() {
  registerSyncJob({
    name: "nfl-state",
    intervalMs: 6 * HOUR,
    run: async (log) => {
      const state = await fetchNflState();
      storeSet("nfl_state", state);
      log.info({ state }, "nfl state synced");
    },
  });

  registerSyncJob({
    name: "sleeper-players",
    intervalMs: 24 * HOUR,
    run: async (log) => {
      if (storeAgeMs("players") < 24 * HOUR) return;
      const raw = await fetchPlayerUniverse();
      const players = normalizePlayers(raw);
      storeSet("players", players);
      log.info({ count: players.length }, "player universe synced");
    },
  });

  registerSyncJob({
    name: "sleeper-projections",
    intervalMs: 6 * HOUR,
    run: async (log) => {
      const config = getConfig();
      const season = config.season;
      const seasonProj = await fetchSeasonProjections(season);
      storeSet(`projections_${season}_0`, seasonProj);
      const { week } = getNflWeek();
      if (week > 0) {
        const weekProj = await fetchWeekProjections(season, week);
        storeSet(`projections_${season}_${week}`, weekProj);
        // Next week too, so lookahead features have data late in the week.
        if (week < 18) {
          const next = await fetchWeekProjections(season, week + 1);
          storeSet(`projections_${season}_${week + 1}`, next);
        }
      }
      log.info({ season, week, count: seasonProj.length }, "sleeper projections synced");
    },
  });

  registerSyncJob({
    name: "sleeper-trending",
    intervalMs: 1 * HOUR,
    run: async (log) => {
      const [adds, drops] = await Promise.all([fetchTrending("add"), fetchTrending("drop")]);
      storeSet("trending", [...adds, ...drops]);
      log.info({ adds: adds.length, drops: drops.length }, "trending synced");
    },
  });

  registerSyncJob({
    name: "nflverse-usage",
    intervalMs: 24 * HOUR,
    run: async (log) => {
      const { season, week } = getNflWeek();
      // Before any games are played this season, last season's usage drives regression flags.
      const target = week > 0 ? season : season - 1;
      if (storeAgeMs(`usage_${target}`) < 24 * HOUR) return;
      const usage = await fetchSeasonUsage(target);
      storeSet(`usage_${target}`, usage);
      log.info({ season: target, rows: usage.length }, "usage synced");
    },
  });

  registerSyncJob({
    name: "borischen-tiers",
    intervalMs: 24 * HOUR,
    run: async (log) => {
      for (const scoring of ["ppr", "half", "std"] as const) {
        const charts = await fetchAllTierCharts(scoring);
        if (charts.length > 0) storeSet(`tiers_${scoring}`, charts);
      }
      log.info("tier charts synced");
    },
  });
}
