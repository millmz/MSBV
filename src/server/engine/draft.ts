import type { League, Player, Position, RosterSlot } from "../../core/types.js";
import { FLEX_ELIGIBLE, POSITIONS } from "../../core/types.js";
import type { BlendMap } from "./blend.js";
import type { VorEntry } from "./vor.js";

/**
 * Draft tools: a scoring-adjusted cheat sheet, and live best-available advice
 * that accounts for roster need, tier cliffs, and positional runs.
 */

export type CheatSheetRow = {
  playerId: string;
  overallRank: number;
  positionRank: number;
  tier: number;
  points: number;
  vor: number;
  /** Market ADP proxy rank; positive value = falls past his worth. */
  adp?: number;
  value?: number;
  /** FantasyPros expert-consensus rank, when a rankings CSV is uploaded. */
  ecr?: number;
};

export function buildCheatSheet(
  blends: BlendMap,
  vor: Map<string, VorEntry>,
  players: Map<string, Player>,
  limit = 250,
  ecr?: Map<string, number>,
): CheatSheetRow[] {
  const rows: CheatSheetRow[] = [];
  for (const [playerId, entry] of vor) {
    rows.push({
      playerId,
      overallRank: 0,
      positionRank: entry.positionRank,
      tier: entry.tier,
      points: entry.points,
      vor: entry.vor,
    });
  }
  // Kickers and defenses never lead a draft board: their weekly variance
  // erases any projected edge, so they sort behind every skill player and
  // only among themselves by value — end-of-draft picks, where they belong.
  const lateGroup = (id: string) => {
    const pos = players.get(id)?.position;
    return pos === "K" || pos === "DST" ? 1 : 0;
  };
  rows.sort((a, b) => lateGroup(a.playerId) - lateGroup(b.playerId) || b.vor - a.vor);
  rows.length = Math.min(rows.length, limit);

  // ADP proxy: Sleeper search rank ordering across drafted-relevant players.
  const bySearch = [...players.values()]
    .filter((p) => p.searchRank !== undefined)
    .sort((a, b) => a.searchRank! - b.searchRank!);
  const adp = new Map(bySearch.map((p, i) => [p.id, i + 1]));

  rows.forEach((row, i) => {
    row.overallRank = i + 1;
    const marketRank = adp.get(row.playerId);
    if (marketRank !== undefined) {
      row.adp = marketRank;
      row.value = marketRank - row.overallRank; // positive = market lets him fall
    }
    const expertRank = ecr?.get(row.playerId);
    if (expertRank !== undefined) row.ecr = expertRank;
  });
  return rows;
}

/**
 * Picks until my next turn in a snake draft, inferred from the observed pick
 * order (works even with a custom first-round order).
 */
export function estimatePicksUntilNext(
  pickTeamIds: string[],
  myTeamId: string,
  teamCount: number,
): number {
  if (teamCount <= 0) return 10;
  // First-round order = first appearance order; pad with unknowns if early.
  const seen: string[] = [];
  for (const id of pickTeamIds) {
    if (!seen.includes(id)) seen.push(id);
    if (seen.length === teamCount) break;
  }
  const order = [...seen];
  while (order.length < teamCount) order.push(`?${order.length}`);
  const myIndex = order.indexOf(myTeamId);
  if (myIndex === -1) return teamCount; // not on the clock yet / unknown

  const current = pickTeamIds.length; // 0-based index of the NEXT overall pick
  for (let overall = current; overall < current + teamCount * 2; overall++) {
    const round = Math.floor(overall / teamCount);
    const posInRound = overall % teamCount;
    const teamIndex = round % 2 === 0 ? posInRound : teamCount - 1 - posInRound;
    if (teamIndex === myIndex) return overall - current;
  }
  return teamCount;
}

export type DraftAdvice = {
  playerId: string;
  score: number;
  vor: number;
  tier: number;
  needFactor: number;
  reasons: string[];
};

/** How many useful players my roster still wants at each position. */
export function rosterNeeds(
  league: League,
  myPicks: string[],
  players: Map<string, Player>,
): Record<Position, number> {
  const slots = league.lineupSlots;
  const flexCount = (["FLEX", "SUPERFLEX", "WRRB"] as RosterSlot[]).reduce(
    (a, s) => a + (slots[s] ?? 0),
    0,
  );
  // Draft targets per position: starters + flex share + depth.
  const targets: Record<Position, number> = {
    QB: (slots.QB ?? 0) + ((slots.SUPERFLEX ?? 0) > 0 ? 1 : 0),
    RB: (slots.RB ?? 0) + Math.ceil(flexCount / 2) + 1,
    WR: (slots.WR ?? 0) + Math.ceil(flexCount / 2) + 1,
    TE: slots.TE ?? 0,
    K: slots.K ?? 0,
    DST: slots.DST ?? 0,
  };
  const have: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
  for (const id of myPicks) {
    const pos = players.get(id)?.position;
    if (pos) have[pos]++;
  }
  const needs = {} as Record<Position, number>;
  for (const pos of POSITIONS) needs[pos] = Math.max(targets[pos] - have[pos], 0);
  return needs;
}

export function bestAvailable(opts: {
  league: League;
  blends: BlendMap;
  vor: Map<string, VorEntry>;
  players: Map<string, Player>;
  taken: Set<string>;
  myPicks: string[];
  /** Position of each of the last N picks league-wide, latest last (run detection). */
  recentPicks?: Position[];
  /** Picks until my next turn (tier-cliff urgency window). */
  picksUntilNext?: number;
  /** My roster spots still to fill — gates the K/DST endgame window. */
  roundsLeft?: number;
  /** Market rank (FantasyPros ECR / ADP) per player, for timing discounts. */
  market?: Map<string, number>;
  /** 1-based overall pick about to be made. */
  currentOverall?: number;
  limit?: number;
}): DraftAdvice[] {
  const { league, vor, players, taken, myPicks, recentPicks = [], picksUntilNext = 10, roundsLeft, market, currentOverall } = opts;
  const needs = rosterNeeds(league, myPicks, players);
  // Real rooms take the first DST around pick 100+ and kickers later still
  // (FantasyPros ADP): K/DST only become live advice when the only spots
  // left to fill are theirs, plus one spare round.
  const kdNeeded = (needs.K > 0 ? 1 : 0) + (needs.DST > 0 ? 1 : 0);
  const kdEndgame = roundsLeft !== undefined && roundsLeft <= kdNeeded + 1;

  // Players left per tier per position (for cliff detection).
  const remainingByPos = new Map<Position, VorEntry[]>();
  for (const [id, entry] of vor) {
    if (taken.has(id)) continue;
    const pos = players.get(id)?.position;
    if (!pos) continue;
    const list = remainingByPos.get(pos) ?? [];
    list.push(entry);
    remainingByPos.set(pos, list);
  }
  for (const list of remainingByPos.values()) list.sort((a, b) => b.points - a.points);

  const runCounts = new Map<Position, number>();
  for (const pos of recentPicks.slice(-6)) {
    runCounts.set(pos, (runCounts.get(pos) ?? 0) + 1);
  }

  const advice: DraftAdvice[] = [];
  for (const [pos, list] of remainingByPos) {
    for (const entry of list.slice(0, 12)) {
      const reasons: string[] = [];
      const needRemaining = needs[pos];
      const isKD = pos === "K" || pos === "DST";
      // Need factor: full value while you still need the position, discounted
      // after — except K/DST, which are worthless outside the endgame window.
      const needFactor = isKD
        ? needRemaining > 0 && kdEndgame
          ? 1
          : 0.02
        : needRemaining > 0
          ? 1
          : 0.55;
      let score = Math.max(entry.vor, 0) * needFactor;
      if (isKD && !kdEndgame) {
        reasons.push(`${pos} is an endgame pick — burn a late round on him, not this one.`);
      }
      if (isKD && kdEndgame && needRemaining > 0) {
        reasons.push(`Time to fill ${pos} — only ${roundsLeft} rounds left.`);
      }

      const marketRank = market?.get(entry.playerId);
      if (
        !isKD &&
        marketRank !== undefined &&
        currentOverall !== undefined &&
        marketRank > currentOverall + picksUntilNext + 6
      ) {
        score *= 0.65;
        reasons.push(`Market has him around #${marketRank} — likely still there on your next turn.`);
      }

      const sameTierLeft = list.filter((e) => e.tier === entry.tier).length;
      if (sameTierLeft <= 2 && needRemaining > 0 && entry.tier <= 5 && !isKD) {
        score += 6;
        reasons.push(`Last ${sameTierLeft === 1 ? "player" : "two"} in ${pos} tier ${entry.tier} — cliff behind him.`);
      }
      const nextTierDrop =
        !isKD && list.find((e) => e.tier === entry.tier + 1) !== undefined && sameTierLeft <= picksUntilNext
          ? entry.points - (list.find((e) => e.tier === entry.tier + 1)?.points ?? entry.points)
          : 0;
      if (nextTierDrop >= 15) {
        score += 4;
        reasons.push(`~${nextTierDrop.toFixed(0)} points fall to the next tier; he likely won't make it back to you.`);
      }
      const run = runCounts.get(pos) ?? 0;
      if (run >= 3 && needRemaining > 0 && !isKD) {
        score += 3;
        reasons.push(`${pos} run in progress (${run} of the last 6 picks).`);
      }
      if (needRemaining === 0) reasons.push(`You're set at ${pos} — only take him as pure value.`);
      if (reasons.length === 0) reasons.push(`Best value on the board at ${pos}.`);

      advice.push({
        playerId: entry.playerId,
        score: Math.round(score * 10) / 10,
        vor: entry.vor,
        tier: entry.tier,
        needFactor,
        reasons,
      });
    }
  }
  advice.sort((a, b) => b.score - a.score);
  return advice.slice(0, opts.limit ?? 12);
}
