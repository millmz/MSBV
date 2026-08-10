import { storeAgeMs, storeGet, storeSet } from "../../store.js";
import { registerSyncJob } from "../../sync/loop.js";
import { fetchAutoProjections, fetchAutoRankings } from "./client.js";

const DAY = 86_400_000;
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
    intervalMs: DAY,
    run: async (log) => {
      const owned = autoOwned();
      let wrote = 0;
      let failures = 0;
      for (const scoring of SCORINGS) {
        for (const [kind, fetcher] of [
          ["rankings", fetchAutoRankings],
          ["projections", fetchAutoProjections],
        ] as const) {
          const key = `fp_${kind}_${scoring}`;
          if (!canAutoWrite(key, owned)) continue;
          try {
            const rows = await fetcher(scoring);
            if (rows.length === 0) continue;
            storeSet(key, rows);
            owned.add(key);
            wrote++;
          } catch {
            failures++;
          }
        }
      }
      storeSet(AUTO_KEYS, [...owned]);
      if (wrote > 0) log.info({ wrote }, "fantasypros auto-synced");
      if (wrote === 0 && failures > 0) {
        throw new Error("couldn't reach fantasypros.com — CSV upload still works");
      }
    },
  });
}
