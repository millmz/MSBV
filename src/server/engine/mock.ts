import type { League, Player, Position, RosterSlot } from "../../core/types.js";
import { FLEX_ELIGIBLE, POSITIONS } from "../../core/types.js";
import type { BlendMap } from "./blend.js";
import type { VorEntry } from "./vor.js";
import { rosterNeeds } from "./draft.js";

/**
 * Mock draft: practice against a room that drafts the way real leaguemates
 * do — off the platform's market rank (ADP proxy) with human noise — while
 * you draft off the VOR board. The gap between those two behaviors is the
 * arbitrage the platform is built around; the report card measures whether
 * you banked it.
 */

/**
 * The market the bots draft from: FantasyPros consensus (ECR) when synced —
 * the list real leaguemates are looking at — falling back to the ADP proxy.
 */
export function buildMarketOrder(
  ids: Iterable<string>,
  players: Map<string, Player>,
  fpRanks?: Map<string, number>,
): string[] {
  const key = (id: string) =>
    fpRanks?.get(id) ?? (players.get(id)?.searchRank ?? 9000) + 500;
  return [...ids].sort((a, b) => key(a) - key(b));
}

/** Team index (0-based) on the clock for a 0-based overall pick, snake order. */
export function snakeTeamIndex(overall: number, teamCount: number): number {
  const round = Math.floor(overall / teamCount);
  const pos = overall % teamCount;
  return round % 2 === 0 ? pos : teamCount - 1 - pos;
}

/** Total roster spots to draft per team (starters + bench, no IR). */
export function rosterSize(league: League): number {
  const s = league.lineupSlots;
  const keys: RosterSlot[] = ["QB", "RB", "WR", "TE", "K", "DST", "FLEX", "SUPERFLEX", "WRRB", "BENCH"];
  const total = keys.reduce((a, k) => a + (s[k] ?? 0), 0);
  return total >= 5 ? total : 15; // sane default when slots are unknown
}

/**
 * One opponent pick. Behavior model: look at the top of the market board
 * (ADP order), lightly randomized — most rooms take the obvious name, some
 * reach — with just enough roster sense to avoid a third QB or an early
 * kicker. `rand` is injectable for deterministic tests.
 */
export function simulateOpponentPick(opts: {
  league: League;
  players: Map<string, Player>;
  marketOrder: string[]; // available + taken, best market rank first
  taken: Set<string>;
  teamPicks: string[];
  roundsLeft: number;
  rand?: () => number;
}): string | undefined {
  const { league, players, marketOrder, taken, teamPicks, roundsLeft, rand = Math.random } = opts;
  const needs = rosterNeeds(league, teamPicks, players);
  const have: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
  for (const id of teamPicks) {
    const pos = players.get(id)?.position;
    if (pos) have[pos]++;
  }
  const needsKD = (["K", "DST"] as Position[]).filter(
    (p) => (league.lineupSlots[p] ?? 0) > 0 && have[p] === 0,
  );

  const acceptable = (id: string): boolean => {
    const pos = players.get(id)?.position;
    if (!pos) return false;
    // Kickers/defenses only when the draft is nearly over — like real rooms.
    if (pos === "K" || pos === "DST") {
      return (league.lineupSlots[pos] ?? 0) > 0 && have[pos] === 0 && roundsLeft <= needsKD.length + 1;
    }
    // Forced K/DST window: fill them before running out of picks.
    if (roundsLeft <= needsKD.length) return false;
    if (pos === "QB" && have.QB >= ((league.lineupSlots.SUPERFLEX ?? 0) > 0 ? 3 : 2)) return false;
    if (pos === "TE" && have.TE >= 2 && needs.TE === 0) return false;
    return true;
  };

  const candidates = marketOrder.filter((id) => !taken.has(id) && acceptable(id)).slice(0, 8);
  if (candidates.length === 0) {
    return marketOrder.find((id) => !taken.has(id));
  }
  // Geometric-ish reach: ~55% the top name, decaying down the shortlist.
  let idx = 0;
  while (idx < candidates.length - 1 && rand() > 0.55) idx++;
  return candidates[idx];
}

export type MockTeamReport = {
  teamIndex: number;
  mine: boolean;
  starterPoints: number;
  rank: number;
  starters: { playerId: string; slot: string; points: number }[];
};

export type MockReport = {
  teams: MockTeamReport[];
  myRank: number;
  fieldAverage: number;
  myStarterPoints: number;
  /** My starters vs the field's average, by position group. */
  positionEdges: { position: string; mine: number; fieldAvg: number }[];
};

/** Greedy optimal starters from a drafted roster using season blend points. */
export function bestStarters(
  league: League,
  picks: string[],
  blends: BlendMap,
  players: Map<string, Player>,
): { playerId: string; slot: string; points: number }[] {
  const pts = (id: string) => blends.get(id)?.points ?? 0;
  const pool = [...picks].sort((a, b) => pts(b) - pts(a));
  const used = new Set<string>();
  const out: { playerId: string; slot: string; points: number }[] = [];

  const fill = (slot: RosterSlot, eligible: (p: Player) => boolean, count: number) => {
    for (let i = 0; i < count; i++) {
      const id = pool.find((pid) => {
        if (used.has(pid)) return false;
        const p = players.get(pid);
        return p ? eligible(p) : false;
      });
      if (!id) continue;
      used.add(id);
      out.push({ playerId: id, slot, points: Math.round(pts(id) * 10) / 10 });
    }
  };

  for (const pos of POSITIONS) {
    fill(pos, (p) => p.position === pos, league.lineupSlots[pos] ?? 0);
  }
  for (const slot of ["FLEX", "SUPERFLEX", "WRRB"] as const) {
    fill(slot, (p) => FLEX_ELIGIBLE[slot]!.includes(p.position), league.lineupSlots[slot] ?? 0);
  }
  return out;
}

export function evaluateMock(opts: {
  league: League;
  blends: BlendMap;
  players: Map<string, Player>;
  teams: string[][]; // picks per team index
  myTeamIndex: number;
}): MockReport {
  const { league, blends, players, teams, myTeamIndex } = opts;
  const reports: MockTeamReport[] = teams.map((picks, teamIndex) => {
    const starters = bestStarters(league, picks, blends, players);
    return {
      teamIndex,
      mine: teamIndex === myTeamIndex,
      starterPoints: Math.round(starters.reduce((a, s) => a + s.points, 0) * 10) / 10,
      rank: 0,
      starters,
    };
  });
  const ordered = [...reports].sort((a, b) => b.starterPoints - a.starterPoints);
  ordered.forEach((r, i) => (r.rank = i + 1));

  const mine = reports[myTeamIndex]!;
  const others = reports.filter((r) => !r.mine);
  const fieldAverage =
    Math.round((others.reduce((a, r) => a + r.starterPoints, 0) / Math.max(others.length, 1)) * 10) / 10;

  const posGroup = (slot: string) => (slot === "FLEX" || slot === "SUPERFLEX" || slot === "WRRB" ? "FLEX" : slot);
  const groups = [...new Set(mine.starters.map((s) => posGroup(s.slot)))];
  const positionEdges = groups.map((g) => {
    const sum = (r: MockTeamReport) =>
      r.starters.filter((s) => posGroup(s.slot) === g).reduce((a, s) => a + s.points, 0);
    return {
      position: g,
      mine: Math.round(sum(mine) * 10) / 10,
      fieldAvg: Math.round((others.reduce((a, r) => a + sum(r), 0) / Math.max(others.length, 1)) * 10) / 10,
    };
  });

  return {
    teams: reports,
    myRank: mine.rank,
    fieldAverage,
    myStarterPoints: mine.starterPoints,
    positionEdges,
  };
}
