import type { League, Player } from "../../core/types.js";
import type { BlendMap } from "./blend.js";
import { positionRanks } from "./blend.js";

/**
 * The market-inefficiency detector. Leaguemates act on the platform's
 * default ranks; we compare those against the consensus blend. Positive
 * edge (platform ranks a player worse than the blend does) = target.
 */

export type Mispricing = {
  playerId: string;
  position: string;
  platformRank: number;
  blendRank: number;
  /** platformRank − blendRank; positive = platform undervalues him. */
  edge: number;
  rostered: boolean;
  onMyTeam: boolean;
  verdict: "target" | "fade";
  explanation: string;
};

export function computeMispricings(
  league: League,
  blends: BlendMap,
  players: Map<string, Player>,
  /** Platform rank per canonical player id (ESPN pool ranks / Yahoo FA order). */
  platformRanks: Map<string, number>,
  minEdge = 8,
): Mispricing[] {
  const blendPosRanks = positionRanks(blends, players);

  // Convert platform overall ranks into per-position ranks for apples-to-apples.
  const byPos = new Map<string, { id: string; rank: number }[]>();
  for (const [id, rank] of platformRanks) {
    const pos = players.get(id)?.position;
    if (!pos) continue;
    const list = byPos.get(pos) ?? [];
    list.push({ id, rank });
    byPos.set(pos, list);
  }
  const platformPosRank = new Map<string, number>();
  for (const list of byPos.values()) {
    list.sort((a, b) => a.rank - b.rank);
    list.forEach((e, i) => platformPosRank.set(e.id, i + 1));
  }

  const rostered = new Set(league.teams.flatMap((t) => t.roster.map((r) => r.playerId)));
  const myRoster = new Set(
    league.teams.find((t) => t.id === league.myTeamId)?.roster.map((r) => r.playerId) ?? [],
  );

  const out: Mispricing[] = [];
  for (const [id, pRank] of platformPosRank) {
    const bRank = blendPosRanks.get(id);
    const player = players.get(id);
    if (bRank === undefined || !player) continue;
    // Only meaningful inside startable ranges.
    if (bRank > 60 && pRank > 60) continue;
    const edge = pRank - bRank;
    if (Math.abs(edge) < minEdge) continue;
    const platformName = league.platform === "espn" ? "ESPN" : "Yahoo";
    out.push({
      playerId: id,
      position: player.position,
      platformRank: pRank,
      blendRank: bRank,
      edge,
      rostered: rostered.has(id),
      onMyTeam: myRoster.has(id),
      verdict: edge > 0 ? "target" : "fade",
      explanation:
        edge > 0
          ? `${platformName} shows him as ${player.position}${pRank}; consensus says ${player.position}${bRank}. Your leaguemates' screens undervalue him.`
          : `${platformName} shows him as ${player.position}${pRank}; consensus says ${player.position}${bRank}. The platform is propping up his price.`,
    });
  }
  return out.sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge));
}
