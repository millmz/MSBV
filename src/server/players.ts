import type { Player, PlayerProjection, TrendingPlayer, UsageWeek } from "../core/types.js";
import { storeGet } from "./store.js";

/**
 * In-memory index over the canonical player universe (persisted by the spine
 * sync). Rebuilt lazily whenever the underlying snapshot changes identity.
 */

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.'`-]/g, "")
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type PlayerIndex = {
  all: Player[];
  byId: Map<string, Player>;
  byEspnId: Map<string, Player>;
  byYahooId: Map<string, Player>;
  byGsisId: Map<string, Player>;
  byName: Map<string, Player[]>;
};

let cached: { index: PlayerIndex; source: Player[] } | undefined;

export function buildIndex(players: Player[]): PlayerIndex {
  const index: PlayerIndex = {
    all: players,
    byId: new Map(),
    byEspnId: new Map(),
    byYahooId: new Map(),
    byGsisId: new Map(),
    byName: new Map(),
  };
  for (const p of players) {
    index.byId.set(p.id, p);
    if (p.espnId) index.byEspnId.set(p.espnId, p);
    if (p.yahooId) index.byYahooId.set(p.yahooId, p);
    if (p.gsisId) index.byGsisId.set(p.gsisId, p);
    const key = normalizeName(p.name);
    const list = index.byName.get(key) ?? [];
    list.push(p);
    index.byName.set(key, list);
  }
  return index;
}

export function getPlayerIndex(): PlayerIndex {
  const players = storeGet<Player[]>("players") ?? [];
  if (!cached || cached.source !== players) {
    cached = { index: buildIndex(players), source: players };
  }
  return cached.index;
}

/** Match by name (+ optional position/team tiebreak) — connector fallback when IDs miss. */
export function findByName(
  index: PlayerIndex,
  name: string,
  position?: string,
  team?: string,
): Player | undefined {
  const candidates = index.byName.get(normalizeName(name)) ?? [];
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];
  const scored = candidates
    .map((p) => {
      let score = 0;
      if (position && p.position === position) score += 2;
      if (team && p.team === team) score += 1;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]!.p;
}

export function getProjections(season: number, week: number): PlayerProjection[] {
  return storeGet<PlayerProjection[]>(`projections_${season}_${week}`) ?? [];
}

export function getTrending(): TrendingPlayer[] {
  return storeGet<TrendingPlayer[]>("trending") ?? [];
}

export function getUsage(season: number): UsageWeek[] {
  return storeGet<UsageWeek[]>(`usage_${season}`) ?? [];
}
