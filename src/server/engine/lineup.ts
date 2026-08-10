import type { League, LeagueTeam, Player, Position, RosterSlot } from "../../core/types.js";
import { FLEX_ELIGIBLE } from "../../core/types.js";
import type { Blend, BlendMap } from "./blend.js";

/**
 * Start/sit. Fills the league's starting slots from a roster, then adjusts
 * for game state: favorites bank floor, underdogs chase ceiling.
 */

export type LineupSlotPick = {
  slot: RosterSlot;
  playerId: string;
  points: number;
  floor: number;
  ceiling: number;
};

export type LineupRecommendation = {
  lineup: LineupSlotPick[];
  totalPoints: number;
  totalFloor: number;
  totalCeiling: number;
  /** Swaps vs the currently set lineup. */
  changes: { out: string; in: string; slot: RosterSlot; delta: number }[];
  gameState: {
    myProjected: number;
    oppProjected?: number;
    posture: "favored" | "underdog" | "tossup" | "unknown";
    explanation: string;
  };
};

const START_SLOTS: RosterSlot[] = ["QB", "RB", "WR", "TE", "K", "DST", "WRRB", "FLEX", "SUPERFLEX"];

function eligible(pos: Position, slot: RosterSlot): boolean {
  if (slot === pos) return true;
  const flex = FLEX_ELIGIBLE[slot];
  return flex ? flex.includes(pos) : false;
}

/**
 * Fill slots most-restrictive first, each taking the best remaining eligible
 * player by `objective`. λ tilts toward ceiling (underdog, λ>0) or floor
 * (favorite, λ<0).
 */
export function optimalLineup(
  roster: { playerId: string }[],
  slots: Record<RosterSlot, number>,
  blends: BlendMap,
  players: Map<string, Player>,
  lambda = 0,
): LineupSlotPick[] {
  const available = new Map<string, { player: Player; blend: Blend }>();
  for (const { playerId } of roster) {
    const player = players.get(playerId);
    const blend = blends.get(playerId);
    if (player && blend) available.set(playerId, { player, blend });
  }
  const objective = (b: Blend) => b.points + lambda * ((b.ceiling - b.floor) / 2);

  const slotInstances: RosterSlot[] = [];
  for (const slot of START_SLOTS) {
    for (let i = 0; i < (slots[slot] ?? 0); i++) slotInstances.push(slot);
  }
  // Most restrictive first: fixed positions, then WRRB, FLEX, SUPERFLEX.
  slotInstances.sort(
    (a, b) => (FLEX_ELIGIBLE[a]?.length ?? 1) - (FLEX_ELIGIBLE[b]?.length ?? 1),
  );

  const picks: LineupSlotPick[] = [];
  for (const slot of slotInstances) {
    let bestId: string | undefined;
    let bestScore = -Infinity;
    for (const [id, { player, blend }] of available) {
      if (!eligible(player.position, slot)) continue;
      const score = objective(blend);
      if (score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    }
    if (bestId) {
      const { blend } = available.get(bestId)!;
      picks.push({
        slot,
        playerId: bestId,
        points: blend.points,
        floor: blend.floor,
        ceiling: blend.ceiling,
      });
      available.delete(bestId);
    }
  }
  // Present in natural order.
  picks.sort((a, b) => START_SLOTS.indexOf(a.slot) - START_SLOTS.indexOf(b.slot));
  return picks;
}

function lineupTotal(picks: LineupSlotPick[]): number {
  return Math.round(picks.reduce((a, p) => a + p.points, 0) * 10) / 10;
}

export function recommendLineup(
  league: League,
  myTeam: LeagueTeam,
  blends: BlendMap,
  players: Map<string, Player>,
): LineupRecommendation {
  // Opponent this week, by mean-optimal lineup.
  const matchup = league.matchups.find(
    (m) =>
      m.week === league.currentWeek &&
      (m.homeTeamId === myTeam.id || m.awayTeamId === myTeam.id),
  );
  const oppId = matchup
    ? matchup.homeTeamId === myTeam.id
      ? matchup.awayTeamId
      : matchup.homeTeamId
    : undefined;
  const opp = league.teams.find((t) => t.id === oppId);

  const myMean = optimalLineup(myTeam.roster, league.lineupSlots, blends, players, 0);
  const oppMean = opp
    ? optimalLineup(opp.roster, league.lineupSlots, blends, players, 0)
    : undefined;
  const myProjected = lineupTotal(myMean);
  const oppProjected = oppMean ? lineupTotal(oppMean) : undefined;

  let posture: LineupRecommendation["gameState"]["posture"] = "unknown";
  let lambda = 0;
  let explanation = "No opponent found for this week — recommending the highest-mean lineup.";
  if (oppProjected !== undefined) {
    const edge = myProjected - oppProjected;
    if (edge > 8) {
      posture = "favored";
      lambda = -0.25;
      explanation = `You're projected to win by ${edge.toFixed(1)} — start the safe floors, don't hand back variance.`;
    } else if (edge < -8) {
      posture = "underdog";
      lambda = 0.25;
      explanation = `You're projected to lose by ${(-edge).toFixed(1)} — chase ceiling; a safe loss is still a loss.`;
    } else {
      posture = "tossup";
      explanation = `Projected within ${Math.abs(edge).toFixed(1)} points — coin-flip game, highest-mean lineup is right.`;
    }
  }

  const lineup = optimalLineup(myTeam.roster, league.lineupSlots, blends, players, lambda);

  // Diff vs currently set lineup (players not in BENCH/IR slots).
  const currentStarters = new Set(
    myTeam.roster.filter((r) => r.slot !== "BENCH" && r.slot !== "IR").map((r) => r.playerId),
  );
  const recommendedIds = new Set(lineup.map((p) => p.playerId));
  const changes: LineupRecommendation["changes"] = [];
  for (const pick of lineup) {
    if (currentStarters.has(pick.playerId)) continue;
    // Someone currently started at a slot this player should take.
    const benched = myTeam.roster.find(
      (r) =>
        !recommendedIds.has(r.playerId) &&
        r.slot !== "BENCH" &&
        r.slot !== "IR" &&
        currentStarters.has(r.playerId) &&
        players.get(r.playerId) !== undefined &&
        eligible(players.get(r.playerId)!.position, pick.slot),
    );
    if (benched) {
      const outBlend = blends.get(benched.playerId);
      changes.push({
        out: benched.playerId,
        in: pick.playerId,
        slot: pick.slot,
        delta: Math.round((pick.points - (outBlend?.points ?? 0)) * 10) / 10,
      });
      currentStarters.delete(benched.playerId);
    }
  }

  return {
    lineup,
    totalPoints: lineupTotal(lineup),
    totalFloor: Math.round(lineup.reduce((a, p) => a + p.floor, 0) * 10) / 10,
    totalCeiling: Math.round(lineup.reduce((a, p) => a + p.ceiling, 0) * 10) / 10,
    changes,
    gameState: { myProjected, oppProjected, posture, explanation },
  };
}
