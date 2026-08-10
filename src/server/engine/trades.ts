import type { League, LeagueTeam, Player } from "../../core/types.js";
import type { BlendMap } from "./blend.js";
import { optimalLineup } from "./lineup.js";
import type { Mispricing } from "./mispricing.js";
import type { VorEntry } from "./vor.js";

/**
 * Trades. Value = rest-of-season VOR, but the verdict comes from roster
 * context: does my best starting lineup actually get better? The finder
 * hunts complementary surpluses across every synced roster and flags
 * desperate (losing) owners.
 */

export type TradeEvaluation = {
  giveValue: number;
  getValue: number;
  /** My optimal-lineup season points before and after the trade. */
  lineupBefore: number;
  lineupAfter: number;
  lineupDelta: number;
  verdict: "accept" | "reject" | "tossup";
  explanation: string;
};

const playerValue = (id: string, vor: Map<string, VorEntry>): number =>
  Math.max(vor.get(id)?.vor ?? 0, 0);

function lineupPoints(
  roster: { playerId: string }[],
  league: League,
  blends: BlendMap,
  players: Map<string, Player>,
): number {
  const lineup = optimalLineup(roster, league.lineupSlots, blends, players, 0);
  return Math.round(lineup.reduce((a, p) => a + p.points, 0) * 10) / 10;
}

export function evaluateTrade(opts: {
  league: League;
  give: string[];
  get: string[];
  seasonBlends: BlendMap;
  vor: Map<string, VorEntry>;
  players: Map<string, Player>;
}): TradeEvaluation {
  const { league, give, get, seasonBlends, vor, players } = opts;
  const myTeam = league.teams.find((t) => t.id === league.myTeamId);
  const roster = myTeam?.roster ?? [];

  const giveValue = give.reduce((a, id) => a + playerValue(id, vor), 0);
  const getValue = get.reduce((a, id) => a + playerValue(id, vor), 0);

  const before = lineupPoints(roster, league, seasonBlends, players);
  const giveSet = new Set(give);
  const after = lineupPoints(
    [...roster.filter((r) => !giveSet.has(r.playerId)), ...get.map((playerId) => ({ playerId }))],
    league,
    seasonBlends,
    players,
  );
  const lineupDelta = Math.round((after - before) * 10) / 10;
  const valueDelta = getValue - giveValue;

  let verdict: TradeEvaluation["verdict"];
  let explanation: string;
  if (lineupDelta > 3 || (lineupDelta >= 0 && valueDelta > 10)) {
    verdict = "accept";
    explanation =
      lineupDelta > 3
        ? `Your best lineup improves by ~${lineupDelta} season points — that's what matters.`
        : `Lineup holds and you bank ${valueDelta.toFixed(0)} points of surplus value (depth/trade capital).`;
  } else if (lineupDelta < -3 || valueDelta < -10) {
    verdict = "reject";
    explanation =
      lineupDelta < -3
        ? `Your best lineup gets ~${Math.abs(lineupDelta)} season points worse.`
        : `You give up ${Math.abs(valueDelta).toFixed(0)} points of value without improving the lineup.`;
  } else {
    verdict = "tossup";
    explanation = "Roughly fair — decide on fit, schedule, and how much you like the players.";
  }
  return {
    giveValue: Math.round(giveValue * 10) / 10,
    getValue: Math.round(getValue * 10) / 10,
    lineupBefore: before,
    lineupAfter: after,
    lineupDelta,
    verdict,
    explanation,
  };
}

export type TradeProposal = {
  targetTeamId: string;
  targetTeamName: string;
  give: string[];
  get: string[];
  myLineupDelta: number;
  theirLineupDelta: number;
  whyTheyAccept: string;
  notes: string[];
};

/** Positions where a team's bench holds starter-caliber value. */
function surplusAndNeeds(
  team: LeagueTeam,
  league: League,
  blends: BlendMap,
  players: Map<string, Player>,
) {
  const starters = new Set(
    optimalLineup(team.roster, league.lineupSlots, blends, players, 0).map((p) => p.playerId),
  );
  const surplus: string[] = [];
  for (const r of team.roster) {
    if (starters.has(r.playerId)) continue;
    const player = players.get(r.playerId);
    const points = blends.get(r.playerId)?.points ?? 0;
    if (!player || player.position === "K" || player.position === "DST") continue;
    // Bench player scoring like a starter → tradable surplus.
    const worstStarterAtPos = Math.min(
      ...[...starters]
        .filter((id) => players.get(id)?.position === player.position)
        .map((id) => blends.get(id)?.points ?? Infinity),
    );
    if (points >= worstStarterAtPos * 0.85 && points > 0) surplus.push(r.playerId);
  }
  return { starters, surplus };
}

export function findTrades(opts: {
  league: League;
  seasonBlends: BlendMap;
  vor: Map<string, VorEntry>;
  players: Map<string, Player>;
  mispricings: Mispricing[];
  limit?: number;
}): TradeProposal[] {
  const { league, seasonBlends, vor, players, mispricings } = opts;
  const myTeam = league.teams.find((t) => t.id === league.myTeamId);
  if (!myTeam) return [];
  const my = surplusAndNeeds(myTeam, league, seasonBlends, players);
  const misById = new Map(mispricings.map((m) => [m.playerId, m]));

  const proposals: TradeProposal[] = [];
  for (const them of league.teams) {
    if (them.id === myTeam.id) continue;
    const theirs = surplusAndNeeds(them, league, seasonBlends, players);
    const desperate = them.wins <= them.losses - 2;

    // Try 1-for-1s: my surplus piece for their surplus piece.
    for (const giveId of my.surplus) {
      for (const getId of theirs.surplus) {
        const givePos = players.get(giveId)?.position;
        const getPos = players.get(getId)?.position;
        if (!givePos || !getPos || givePos === getPos) continue;

        const evalForMe = evaluateTrade({
          league, give: [giveId], get: [getId], seasonBlends, vor, players,
        });
        if (evalForMe.lineupDelta < 2) continue;

        // Their side, from their roster's perspective.
        const theirBefore = lineupPoints(them.roster, league, seasonBlends, players);
        const theirAfter = lineupPoints(
          [
            ...them.roster.filter((r) => r.playerId !== getId),
            { playerId: giveId },
          ],
          league,
          seasonBlends,
          players,
        );
        const theirDelta = Math.round((theirAfter - theirBefore) * 10) / 10;
        // Only propose trades that don't gut the other side — those get rejected
        // (and make you the league's shark nobody trades with).
        if (theirDelta < -6) continue;

        const notes: string[] = [];
        const mis = misById.get(getId);
        if (mis?.verdict === "target") {
          notes.push(`Bonus: ${mis.explanation}`);
        }
        if (desperate) notes.push(`They're ${them.wins}-${them.losses} — losing teams take swings.`);

        proposals.push({
          targetTeamId: them.id,
          targetTeamName: them.name,
          give: [giveId],
          get: [getId],
          myLineupDelta: evalForMe.lineupDelta,
          theirLineupDelta: theirDelta,
          whyTheyAccept:
            theirDelta >= 0
              ? `Their lineup improves too (+${theirDelta}) — you're trading surplus for surplus at different positions.`
              : `Costs them little (${theirDelta}) and fills their thinner position; frame it around their need.`,
          notes,
        });
      }
    }
  }

  proposals.sort((a, b) => b.myLineupDelta - a.myLineupDelta);
  return proposals.slice(0, opts.limit ?? 6);
}
