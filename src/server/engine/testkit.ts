import type { League, Player, Position, RosterSlot } from "../../core/types.js";
import type { Blend, BlendMap } from "./blend.js";

/** Small helpers for building engine test scenarios by hand. */

export function mkPlayer(id: string, position: Position, over: Partial<Player> = {}): Player {
  return { id, name: `Player ${id}`, position, team: "KC", ...over };
}

export function mkPlayers(spec: Record<string, Position>): Map<string, Player> {
  const map = new Map<string, Player>();
  for (const [id, position] of Object.entries(spec)) map.set(id, mkPlayer(id, position));
  return map;
}

/** Blend map from points, with symmetric ±spread floor/ceiling. */
export function mkBlends(points: Record<string, number>, spreadPct = 0.25): BlendMap {
  const map: BlendMap = new Map();
  for (const [playerId, pts] of Object.entries(points)) {
    const spread = pts * spreadPct;
    const blend: Blend = {
      playerId,
      points: pts,
      floor: Math.max(0, pts - spread),
      ceiling: pts + spread,
      sources: { sleeper: pts },
      volatile: false,
    };
    map.set(playerId, blend);
  }
  return map;
}

export function mkLeague(over: Partial<League> = {}): League {
  return {
    id: "espn:1",
    platform: "espn",
    platformLeagueId: "1",
    name: "Test League",
    season: 2026,
    currentWeek: 3,
    scoring: { label: "PPR", perStat: { rec: 1, rec_yd: 0.1, rush_yd: 0.1, rec_td: 6, rush_td: 6, pass_yd: 0.04, pass_td: 4 } },
    lineupSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 0, DST: 0, BENCH: 5, IR: 0 } as Record<RosterSlot, number>,
    teams: [],
    matchups: [],
    freeAgents: [],
    syncedAt: new Date().toISOString(),
    ...over,
  };
}

export function mkRoster(ids: string[], starters: string[] = []): { playerId: string; slot: RosterSlot; platformPlayerId: string }[] {
  return ids.map((playerId) => ({
    playerId,
    slot: (starters.includes(playerId) ? "RB" : "BENCH") as RosterSlot,
    platformPlayerId: playerId,
  }));
}
