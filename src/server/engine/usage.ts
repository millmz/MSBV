import type { Player, UsageWeek } from "../../core/types.js";

/**
 * Usage-based regression: opportunity (targets, carries) converted to
 * expected PPR points and compared with actual scoring. Big positive gaps
 * are unsustainable (sell high); strong usage with weak output is bad luck
 * (buy low). Usage leads, box scores lag.
 */

export type UsageInsight = {
  playerId: string;
  games: number;
  avgTargets: number;
  avgCarries: number;
  avgTargetShare?: number;
  /** Expected PPR points per game from opportunity volume. */
  expectedPpg: number;
  actualPpg: number;
  /** actual − expected; positive = overperforming. */
  delta: number;
  flag?: "sell-high" | "buy-low";
  explanation?: string;
};

/** League-average PPR value of one opportunity. */
const POINTS_PER_TARGET = 1.85;
const POINTS_PER_CARRY = 0.55;
/** How many recent weeks of usage to trust. */
const WINDOW = 5;

export function computeUsageInsights(
  usage: UsageWeek[],
  players: Map<string, Player>,
  byGsisId: Map<string, Player>,
): Map<string, UsageInsight> {
  const byPlayer = new Map<string, UsageWeek[]>();
  for (const week of usage) {
    const player = byGsisId.get(week.gsisId);
    if (!player) continue;
    const list = byPlayer.get(player.id) ?? [];
    list.push(week);
    byPlayer.set(player.id, list);
  }

  const out = new Map<string, UsageInsight>();
  for (const [playerId, weeks] of byPlayer) {
    const player = players.get(playerId);
    if (!player || player.position === "K" || player.position === "DST") continue;
    weeks.sort((a, b) => a.week - b.week);
    const recent = weeks.slice(-WINDOW);
    const games = recent.length;
    if (games < 2) continue;

    const avg = (f: (w: UsageWeek) => number | undefined) => {
      const vals = recent.map(f).filter((v): v is number => v !== undefined);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };
    const avgTargets = avg((w) => w.targets);
    const avgCarries = avg((w) => w.carries);
    const shareVals = recent.map((w) => w.targetShare).filter((v): v is number => v !== undefined);
    const avgTargetShare = shareVals.length
      ? shareVals.reduce((a, b) => a + b, 0) / shareVals.length
      : undefined;
    const expectedPpg = avgTargets * POINTS_PER_TARGET + avgCarries * POINTS_PER_CARRY;
    const actualPpg = avg((w) => w.fantasyPointsPpr);
    // QBs' passing production isn't captured by targets/carries — skip them.
    if (player.position === "QB") continue;
    const delta = actualPpg - expectedPpg;

    let flag: UsageInsight["flag"];
    let explanation: string | undefined;
    const strongUsage = avgTargets >= 5.5 || avgCarries >= 10 || (avgTargetShare ?? 0) >= 0.18;
    if (delta >= 4.5 && actualPpg > 8) {
      flag = "sell-high";
      explanation = `Scoring ${actualPpg.toFixed(1)}/g on usage worth ~${expectedPpg.toFixed(1)} — TD/efficiency spike that usually regresses.`;
    } else if (delta <= -3 && strongUsage) {
      flag = "buy-low";
      explanation = `Usage worth ~${expectedPpg.toFixed(1)}/g (${avgTargets.toFixed(1)} tgt, ${avgCarries.toFixed(1)} car) but scoring ${actualPpg.toFixed(1)} — volume like that usually converts soon.`;
    }

    out.set(playerId, {
      playerId,
      games,
      avgTargets: round1(avgTargets),
      avgCarries: round1(avgCarries),
      avgTargetShare: avgTargetShare !== undefined ? Math.round(avgTargetShare * 100) / 100 : undefined,
      expectedPpg: round1(expectedPpg),
      actualPpg: round1(actualPpg),
      delta: round1(delta),
      flag,
      explanation,
    });
  }
  return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
