import type { League, Player, Position, RosterSlot } from "../../core/types.js";
import { FLEX_ELIGIBLE, POSITIONS } from "../../core/types.js";
import type { BlendMap } from "./blend.js";

/**
 * Value over replacement. "Replacement" = the best player left on the wire
 * after every league starting slot (including flex, allocated greedily by
 * points) is filled.
 */

export type VorEntry = {
  playerId: string;
  points: number;
  vor: number;
  positionRank: number;
  tier: number;
};

/** Count of starters the league consumes per position, flex included. */
export function starterCounts(league: League, blends: BlendMap, players: Map<string, Player>) {
  const teamCount = Math.max(league.teams.length, 2);
  const slots = league.lineupSlots;

  const byPos = new Map<Position, number[]>();
  for (const [id, blend] of blends) {
    const pos = players.get(id)?.position;
    if (!pos) continue;
    const list = byPos.get(pos) ?? [];
    list.push(blend.points);
    byPos.set(pos, list);
  }
  for (const list of byPos.values()) list.sort((a, b) => b - a);

  const counts: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
  for (const pos of POSITIONS) {
    counts[pos] = teamCount * (slots[pos] ?? 0);
  }
  // Allocate flex slots greedily: each flex goes to the eligible position whose
  // next-best remaining player scores highest.
  const flexSlots: [RosterSlot, number][] = (["FLEX", "SUPERFLEX", "WRRB"] as RosterSlot[])
    .map((s) => [s, (slots[s] ?? 0) * teamCount] as [RosterSlot, number])
    .filter(([, n]) => n > 0);
  for (const [slot, n] of flexSlots) {
    const eligible = FLEX_ELIGIBLE[slot] ?? [];
    for (let i = 0; i < n; i++) {
      let best: Position | undefined;
      let bestPoints = -Infinity;
      for (const pos of eligible) {
        const next = byPos.get(pos)?.[counts[pos]];
        if (next !== undefined && next > bestPoints) {
          bestPoints = next;
          best = pos;
        }
      }
      if (best) counts[best]++;
    }
  }
  return counts;
}

/** Points of the replacement-level player at each position. */
export function replacementLevels(
  league: League,
  blends: BlendMap,
  players: Map<string, Player>,
): Record<Position, number> {
  const counts = starterCounts(league, blends, players);
  const byPos = new Map<Position, number[]>();
  for (const [id, blend] of blends) {
    const pos = players.get(id)?.position;
    if (!pos) continue;
    const list = byPos.get(pos) ?? [];
    list.push(blend.points);
    byPos.set(pos, list);
  }
  const out = {} as Record<Position, number>;
  for (const pos of POSITIONS) {
    const list = (byPos.get(pos) ?? []).sort((a, b) => b - a);
    out[pos] = list[counts[pos]] ?? list[list.length - 1] ?? 0;
  }
  return out;
}

/** Tier breaks: a new tier starts on any big points drop between neighbors. */
export function assignTiers(sortedPoints: number[]): number[] {
  const tiers: number[] = [];
  let tier = 1;
  for (let i = 0; i < sortedPoints.length; i++) {
    if (i > 0) {
      const gap = sortedPoints[i - 1]! - sortedPoints[i]!;
      const threshold = Math.max(4, sortedPoints[0]! * 0.045);
      if (gap >= threshold) tier++;
    }
    tiers.push(tier);
  }
  return tiers;
}

export function computeVor(
  league: League,
  blends: BlendMap,
  players: Map<string, Player>,
): Map<string, VorEntry> {
  const replacement = replacementLevels(league, blends, players);
  const byPos = new Map<Position, { id: string; points: number }[]>();
  for (const [id, blend] of blends) {
    const pos = players.get(id)?.position;
    if (!pos) continue;
    const list = byPos.get(pos) ?? [];
    list.push({ id, points: blend.points });
    byPos.set(pos, list);
  }
  const out = new Map<string, VorEntry>();
  for (const [pos, list] of byPos) {
    list.sort((a, b) => b.points - a.points);
    const tiers = assignTiers(list.map((e) => e.points));
    list.forEach((entry, i) => {
      out.set(entry.id, {
        playerId: entry.id,
        points: entry.points,
        vor: Math.round((entry.points - replacement[pos]) * 10) / 10,
        positionRank: i + 1,
        tier: tiers[i]!,
      });
    });
  }
  return out;
}
