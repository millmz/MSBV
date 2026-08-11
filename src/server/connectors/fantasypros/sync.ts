import { storeAgeMs, storeGet, storeSet } from "../../store.js";
import { HttpError } from "../../http.js";
import { registerSyncJob } from "../../sync/loop.js";
import { getNflWeek } from "../../sync/spine.js";
import { fetchApiProjections, fetchApiRankings, fpApiKey } from "./api.js";
import {
  fetchAutoProjections,
  fetchAutoRankings,
  fetchRosRankings,
  fetchWeekRankings,
} from "./client.js";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SCORINGS = ["ppr", "half", "std"] as const;

/** Store keys the auto-sync owns; a manual CSV upload takes a key back. */
const AUTO_KEYS = "fp_auto_keys";

function autoOwned(): Set<string> {
  return new Set(storeGet<string[]>(AUTO_KEYS) ?? []);
}

/** Called by the upload route so a manual file outranks auto data. */
export function markFpManualUpload(key: string) {
  const owned = autoOwned();
  if (owned.delete(key)) storeSet(AUTO_KEYS, [...owned]);
}

/** Auto-sync may write a key it owns, an empty key, or a stale manual one. */
function canAutoWrite(key: string, owned: Set<string>): boolean {
  if (owned.has(key)) return true;
  if (storeGet(key) === undefined) return true;
  return storeAgeMs(key) > 7 * DAY;
}

export function registerFantasyProsJobs() {
  registerSyncJob({
    name: "fantasypros-auto",
    intervalMs: 6 * HOUR,
    run: async (log) => {
      const { week } = getNflWeek();
      const owned = autoOwned();
      const viaApi = Boolean(fpApiKey());

      type Dataset = { key: string; fetch: () => Promise<unknown[]>; minAgeMs: number };
      const datasets: Dataset[] = [];
      for (const s of SCORINGS) {
        // Draft-season data drifts slowly; ROS and weekly move all week long.
        // With an API key, everything comes from the official API; the page
        // scrape is only the keyless fallback.
        datasets.push(
          {
            key: `fp_rankings_${s}`,
            fetch: () => (viaApi ? fetchApiRankings(s, "draft") : fetchAutoRankings(s)),
            minAgeMs: DAY,
          },
          {
            key: `fp_projections_${s}`,
            fetch: () => (viaApi ? fetchApiProjections(s) : fetchAutoProjections(s)),
            minAgeMs: DAY,
          },
          {
            key: `fp_ros_${s}`,
            fetch: () => (viaApi ? fetchApiRankings(s, "ros") : fetchRosRankings(s)),
            minAgeMs: 6 * HOUR,
          },
        );
        if (week > 0) {
          datasets.push(
            {
              key: `fp_week_ranks_${s}`,
              fetch: () => (viaApi ? fetchApiRankings(s, "weekly", week) : fetchWeekRankings(s)),
              minAgeMs: 6 * HOUR,
            },
            {
              key: `fp_week_projections_${s}`,
              fetch: () => (viaApi ? fetchApiProjections(s, week) : fetchAutoProjections(s, week)),
              minAgeMs: 6 * HOUR,
            },
          );
        }
      }

      let wrote = 0;
      let failures = 0;
      let authFailure = false;
      for (const d of datasets) {
        if (!canAutoWrite(d.key, owned)) continue;
        if (owned.has(d.key) && storeAgeMs(d.key) < d.minAgeMs) continue;
        try {
          const rows = await d.fetch();
          if (rows.length === 0) continue;
          storeSet(d.key, rows);
          owned.add(d.key);
          wrote++;
        } catch (err) {
          failures++;
          if (err instanceof HttpError && (err.status === 401 || err.status === 403)) authFailure = true;
        }
      }
      storeSet(AUTO_KEYS, [...owned]);
      if (wrote > 0) log.info({ wrote, week, viaApi }, "fantasypros auto-synced");
      if (wrote === 0 && failures > 0) {
        throw new Error(
          viaApi && authFailure
            ? "FantasyPros rejected the API key — check it on the Setup page"
            : "couldn't reach FantasyPros — CSV upload still works",
        );
      }
    },
  });
}
