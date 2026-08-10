import type { League, Player, TrendingPlayer } from "../../core/types.js";
import type { BlendMap } from "./blend.js";
import type { Mispricing } from "./mispricing.js";
import type { UsageInsight } from "./usage.js";
import type { VorEntry } from "./vor.js";

/**
 * Waiver targets: free agents ranked by how much they'd actually improve THIS
 * roster, sharpened by trending velocity, mispricing edge, and usage flags.
 * Every target names the drop that pays for him.
 */

export type WaiverTarget = {
  playerId: string;
  score: number;
  weekPoints?: number;
  seasonVor: number;
  /** Improvement over my weakest rostered player at the position (season points). */
  upgradeOver?: { playerId: string; delta: number };
  trendingAdds?: number;
  reasons: string[];
  suggestedDrop?: string;
};

export type DropCandidate = {
  playerId: string;
  seasonVor: number;
  reason: string;
};

export function computeWaivers(opts: {
  league: League;
  seasonBlends: BlendMap;
  weekBlends?: BlendMap;
  vor: Map<string, VorEntry>;
  players: Map<string, Player>;
  trending: TrendingPlayer[];
  usage: Map<string, UsageInsight>;
  mispricings: Mispricing[];
  limit?: number;
}): { targets: WaiverTarget[]; drops: DropCandidate[] } {
  const { league, seasonBlends, weekBlends, vor, players, trending, usage, mispricings } = opts;
  const myTeam = league.teams.find((t) => t.id === league.myTeamId);
  const myRoster = myTeam?.roster ?? [];

  const trendingAdds = new Map(
    trending.filter((t) => t.direction === "add").map((t) => [t.playerId, t.count]),
  );
  const maxTrend = Math.max(1, ...trendingAdds.values());
  const mispricingById = new Map(mispricings.map((m) => [m.playerId, m]));

  // Drop candidates: bench players ranked by season value, K/DST duplicates first.
  const benchable = myRoster
    .filter((r) => r.slot === "BENCH")
    .map((r) => ({
      playerId: r.playerId,
      seasonVor: vor.get(r.playerId)?.vor ?? -99,
      player: players.get(r.playerId),
    }))
    .sort((a, b) => a.seasonVor - b.seasonVor);
  const drops: DropCandidate[] = benchable.slice(0, 4).map((b) => ({
    playerId: b.playerId,
    seasonVor: b.seasonVor,
    reason:
      b.seasonVor <= 0
        ? "Below replacement level rest-of-season — the wire can beat him."
        : "Weakest bench value if you need the roster spot.",
  }));

  // My weakest season points per position (upgrade baseline).
  const myWorstByPos = new Map<string, { playerId: string; points: number }>();
  for (const r of myRoster) {
    const pos = players.get(r.playerId)?.position;
    const points = seasonBlends.get(r.playerId)?.points;
    if (!pos || points === undefined) continue;
    const cur = myWorstByPos.get(pos);
    if (!cur || points < cur.points) myWorstByPos.set(pos, { playerId: r.playerId, points });
  }

  const targets: WaiverTarget[] = [];
  for (const fa of league.freeAgents) {
    const player = players.get(fa.playerId);
    const season = seasonBlends.get(fa.playerId);
    if (!player || !season) continue;
    const entry = vor.get(fa.playerId);
    const seasonVor = entry?.vor ?? 0;
    const week = weekBlends?.get(fa.playerId)?.points;
    const reasons: string[] = [];
    let score = Math.max(seasonVor, 0);

    const worst = myWorstByPos.get(player.position);
    let upgradeOver: WaiverTarget["upgradeOver"];
    if (worst && season.points > worst.points + 5) {
      const delta = Math.round((season.points - worst.points) * 10) / 10;
      upgradeOver = { playerId: worst.playerId, delta };
      score += delta * 0.5;
      reasons.push(`Upgrades your weakest ${player.position} by ~${delta.toFixed(0)} season points.`);
    }

    const trend = trendingAdds.get(fa.playerId);
    if (trend) {
      score += (trend / maxTrend) * 12;
      reasons.push(`${trend.toLocaleString()} Sleeper adds in 24h — the market is moving, beat your league to it.`);
    }

    const mis = mispricingById.get(fa.playerId);
    if (mis?.verdict === "target") {
      score += Math.min(mis.edge, 20) * 0.6;
      reasons.push(mis.explanation);
    }

    const use = usage.get(fa.playerId);
    if (use?.flag === "buy-low") {
      score += 8;
      reasons.push(use.explanation!);
    }

    if (week !== undefined && week >= 9) {
      score += 3;
      reasons.push(`Startable this week (~${week.toFixed(1)} pts).`);
    }

    if (reasons.length === 0 && seasonVor <= 0) continue;
    if (reasons.length === 0) reasons.push("Best pure value left on the wire.");

    targets.push({
      playerId: fa.playerId,
      score: Math.round(score * 10) / 10,
      weekPoints: week,
      seasonVor,
      upgradeOver,
      trendingAdds: trend,
      reasons,
      suggestedDrop: pickDrop(player, drops, players),
    });
  }

  targets.sort((a, b) => b.score - a.score);
  return { targets: targets.slice(0, opts.limit ?? 15), drops };
}

/** Prefer dropping same-position dead weight; otherwise the weakest bench value. */
function pickDrop(
  incoming: Player,
  drops: DropCandidate[],
  players: Map<string, Player>,
): string | undefined {
  const samePos = drops.find((d) => players.get(d.playerId)?.position === incoming.position);
  return (samePos ?? drops[0])?.playerId;
}

/** Best streaming option at a position for the current week (DST/K/TE). */
export function streamOfTheWeek(
  league: League,
  weekBlends: BlendMap,
  players: Map<string, Player>,
  position: "DST" | "K" | "TE",
): { playerId: string; points: number } | undefined {
  let best: { playerId: string; points: number } | undefined;
  for (const fa of league.freeAgents) {
    if (players.get(fa.playerId)?.position !== position) continue;
    const points = weekBlends.get(fa.playerId)?.points;
    if (points !== undefined && (!best || points > best.points)) {
      best = { playerId: fa.playerId, points };
    }
  }
  return best;
}
