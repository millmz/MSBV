import type {
  Player,
  PlayerProjection,
  Position,
  ScoringRules,
} from "../../core/types.js";
import { hasUsableRules, scoreStatLine } from "./scoring.js";

/**
 * Consensus blend: every projection source expressed in THIS league's points,
 * averaged, with cross-source disagreement surfaced as floor/ceiling and a
 * volatility flag. Sources:
 *  - Sleeper stat projections × the league's exact scoring rules
 *  - the platform's own projection for this league (already in league points)
 */

export type Blend = {
  playerId: string;
  /** Blended points (league scoring). */
  points: number;
  floor: number;
  ceiling: number;
  /** Per-source points that fed the blend. */
  sources: Record<string, number>;
  /** True when sources disagree materially (>15% of the mean). */
  volatile: boolean;
};

export type BlendMap = Map<string, Blend>;

/**
 * Blend weights. FantasyPros is the paid expert-consensus layer — weighted
 * heaviest by design; Sleeper and the platform projection are supporting
 * opinions. Volatility detection still treats sources equally.
 */
const SOURCE_WEIGHTS: Record<string, number> = { sleeper: 1, platform: 1, fantasypros: 2.5 };

function weightedMean(sources: Record<string, number>): number {
  let sum = 0;
  let wsum = 0;
  for (const [name, value] of Object.entries(sources)) {
    const w = SOURCE_WEIGHTS[name] ?? 1;
    sum += value * w;
    wsum += w;
  }
  return wsum > 0 ? sum / wsum : NaN;
}

/** Weekly score variability priors by position (CV of weekly outcomes). */
const POSITION_CV: Record<Position, number> = {
  QB: 0.2,
  RB: 0.28,
  WR: 0.32,
  TE: 0.34,
  K: 0.4,
  DST: 0.45,
};

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (values.length - 1));
}

export function computeBlends(opts: {
  players: Map<string, Player>;
  sleeperProjections: PlayerProjection[];
  /** Platform projection in league points, keyed by canonical player id. */
  platformProjections?: Map<string, number>;
  /** FantasyPros projection (from subscriber CSV export), keyed by canonical player id. */
  fpProjections?: Map<string, number>;
  rules: ScoringRules;
}): BlendMap {
  const { players, sleeperProjections, platformProjections, fpProjections, rules } = opts;
  const usable = hasUsableRules(rules);
  const out: BlendMap = new Map();

  for (const proj of sleeperProjections) {
    const player = players.get(proj.playerId);
    if (!player) continue;
    const sources: Record<string, number> = {};

    const sleeperPoints = usable ? scoreStatLine(proj.stats, rules) : (proj.defaultPoints ?? 0);
    // K/DST stat vocabularies are patchy across platforms — trust the source's
    // own point total when our scored value comes out implausibly low.
    if ((player.position === "K" || player.position === "DST") && proj.defaultPoints) {
      sources.sleeper = sleeperPoints > 0.5 * proj.defaultPoints ? sleeperPoints : proj.defaultPoints;
    } else {
      sources.sleeper = sleeperPoints;
    }

    const platform = platformProjections?.get(proj.playerId);
    if (platform !== undefined && platform > 0) sources.platform = platform;

    const fp = fpProjections?.get(proj.playerId);
    if (fp !== undefined && fp > 0) sources.fantasypros = fp;

    const values = Object.values(sources);
    const mean = weightedMean(sources);
    if (!Number.isFinite(mean)) continue;

    const disagreement = stdev(values);
    const prior = (POSITION_CV[player.position] ?? 0.3) * Math.max(mean, 0);
    const spread = Math.max(disagreement, prior);
    out.set(proj.playerId, {
      playerId: proj.playerId,
      points: round1(mean),
      floor: round1(Math.max(0, mean - spread)),
      ceiling: round1(mean + spread),
      sources,
      volatile: values.length >= 2 && mean > 0 && disagreement / mean > 0.15,
    });
  }

  // Players Sleeper doesn't project but another source does — without this
  // backfill they'd vanish from every board.
  const backfills: [string, Map<string, number> | undefined][] = [
    ["platform", platformProjections],
    ["fantasypros", fpProjections],
  ];
  for (const [sourceName, map] of backfills) {
    if (!map) continue;
    for (const [playerId, points] of map) {
      if (out.has(playerId) || points <= 0) continue;
      const player = players.get(playerId);
      if (!player) continue;
      const prior = (POSITION_CV[player.position] ?? 0.3) * points;
      out.set(playerId, {
        playerId,
        points: round1(points),
        floor: round1(Math.max(0, points - prior)),
        ceiling: round1(points + prior),
        sources: { [sourceName]: points },
        volatile: false,
      });
    }
  }

  return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Rank players by blended points within a position (1-based). */
export function positionRanks(blends: BlendMap, players: Map<string, Player>): Map<string, number> {
  const byPos = new Map<Position, Blend[]>();
  for (const blend of blends.values()) {
    const pos = players.get(blend.playerId)?.position;
    if (!pos) continue;
    const list = byPos.get(pos) ?? [];
    list.push(blend);
    byPos.set(pos, list);
  }
  const ranks = new Map<string, number>();
  for (const list of byPos.values()) {
    list.sort((a, b) => b.points - a.points);
    list.forEach((b, i) => ranks.set(b.playerId, i + 1));
  }
  return ranks;
}
