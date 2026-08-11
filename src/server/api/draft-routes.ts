import type { FastifyInstance } from "fastify";
import type { Position } from "../../core/types.js";
import { getConfig } from "../config.js";
import { fetchDraftRaw } from "../connectors/espn/client.js";
import { fetchDraftResultsRaw } from "../connectors/yahoo/client.js";
import { dig, yahooCollection } from "../connectors/yahoo/parse.js";
import { buildLeagueContext, type LeagueContext } from "../engine/context.js";
import { bestAvailable, buildCheatSheet, estimatePicksUntilNext } from "../engine/draft.js";
import { evaluateMock, rosterSize, simulateOpponentPick, snakeTeamIndex } from "../engine/mock.js";
import { getPlayerIndex } from "../players.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

type DraftPick = { overall: number; teamId: string; playerId?: string; platformPlayerId: string };

/** ESPN mDraftDetail → normalized picks. */
function mapEspnDraft(raw: any): DraftPick[] {
  const index = getPlayerIndex();
  const picks: any[] = raw?.draftDetail?.picks ?? [];
  return picks
    .map((p) => ({
      overall: p?.overallPickNumber ?? 0,
      teamId: String(p?.teamId ?? ""),
      playerId: index.byEspnId.get(String(p?.playerId))?.id,
      platformPlayerId: String(p?.playerId ?? ""),
    }))
    .filter((p) => p.overall > 0)
    .sort((a, b) => a.overall - b.overall);
}

/** Yahoo draftresults → normalized picks. */
function mapYahooDraft(raw: any): DraftPick[] {
  const index = getPlayerIndex();
  const results = yahooCollection(dig(raw, "fantasy_content", "league", 1, "draft_results"));
  return results
    .map((r: any) => {
      const dr = r?.draft_result ?? {};
      const yahooId = String(dr?.player_key ?? "").split(".p.")[1];
      return {
        overall: Number(dr?.pick ?? 0),
        teamId: String(dr?.team_key ?? "").split(".t.")[1] ?? "",
        playerId: yahooId ? index.byYahooId.get(yahooId)?.id : undefined,
        platformPlayerId: String(dr?.player_key ?? ""),
      };
    })
    .filter((p: DraftPick) => p.overall > 0)
    .sort((a: DraftPick, b: DraftPick) => a.overall - b.overall);
}

export async function registerDraftRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/api/league/:id/draft/cheatsheet", async (req, reply) => {
    const ctx = buildLeagueContext(decodeURIComponent(req.params.id));
    if (!ctx) return reply.code(404).send({ error: "league not synced" });
    const sheet = buildCheatSheet(
      ctx.seasonBlends,
      ctx.vor,
      ctx.players,
      200,
      ctx.fpRanks.size ? ctx.fpRanks : undefined,
    );
    return {
      scoringLabel: ctx.league.scoring.label,
      rows: sheet.map((row) => {
        const p = ctx.players.get(row.playerId);
        return {
          ...row,
          name: p?.name ?? row.playerId,
          position: p?.position,
          team: p?.team,
          byeWeek: p?.byeWeek,
          injuryStatus: p?.injuryStatus,
        };
      }),
    };
  });

  /** Market board for opponent AI: ADP-proxy order over the draftable pool. */
  const marketOrder = (ctx: LeagueContext): string[] =>
    [...ctx.vor.keys()].sort(
      (a, b) => (ctx.players.get(a)?.searchRank ?? 1e9) - (ctx.players.get(b)?.searchRank ?? 1e9),
    );

  const mockCard = (ctx: LeagueContext, id: string) => {
    const p = ctx.players.get(id);
    return {
      id,
      name: p?.name ?? id,
      position: p?.position ?? "?",
      team: p?.team,
      seasonPoints: ctx.seasonBlends.get(id)?.points,
    };
  };

  type MockBody = {
    teamCount?: number;
    mySlot?: number;
    rounds?: number;
    picks?: string[];
    myPickId?: string;
  };

  /**
   * Stateless mock draft step: apply my pick (if given), simulate opponents
   * (who draft by market rank) until I'm back on the clock or it's over.
   */
  app.post<{ Params: { id: string }; Body: MockBody }>(
    "/api/league/:id/mock/advance",
    async (req, reply) => {
      const ctx = buildLeagueContext(decodeURIComponent(req.params.id));
      if (!ctx) return reply.code(404).send({ error: "league not synced" });
      const teamCount = Math.min(Math.max(req.body?.teamCount ?? ctx.league.teams.length ?? 10, 4), 16);
      const mySlot = Math.min(Math.max(req.body?.mySlot ?? 1, 1), teamCount);
      const rounds = Math.min(Math.max(req.body?.rounds ?? rosterSize(ctx.league), 8), 20);
      const myIndex = mySlot - 1;
      const total = teamCount * rounds;
      const picks = [...(req.body?.picks ?? [])];
      const taken = new Set(picks);
      const market = marketOrder(ctx);

      if (req.body?.myPickId) {
        if (snakeTeamIndex(picks.length, teamCount) !== myIndex) {
          return reply.code(400).send({ error: "not your pick" });
        }
        if (taken.has(req.body.myPickId) || !ctx.players.has(req.body.myPickId)) {
          return reply.code(400).send({ error: "player unavailable" });
        }
        picks.push(req.body.myPickId);
        taken.add(req.body.myPickId);
      }

      while (picks.length < total && snakeTeamIndex(picks.length, teamCount) !== myIndex) {
        const teamIndex = snakeTeamIndex(picks.length, teamCount);
        const teamPicks = picks.filter((_, i) => snakeTeamIndex(i, teamCount) === teamIndex);
        const roundsLeft = rounds - teamPicks.length;
        const pick = simulateOpponentPick({
          league: ctx.league,
          players: ctx.players,
          marketOrder: market,
          taken,
          teamPicks,
          roundsLeft,
        });
        if (!pick) break;
        picks.push(pick);
        taken.add(pick);
      }

      const done = picks.length >= total;
      const myPicks = picks.filter((_, i) => snakeTeamIndex(i, teamCount) === myIndex);
      const recentPicks = picks
        .slice(-6)
        .map((id) => ctx.players.get(id)?.position)
        .filter((pos): pos is Position => Boolean(pos));

      const advice = done
        ? []
        : bestAvailable({
            league: ctx.league,
            blends: ctx.seasonBlends,
            vor: ctx.vor,
            players: ctx.players,
            taken,
            myPicks,
            recentPicks,
            picksUntilNext: teamCount,
            limit: 8,
          });

      return {
        teamCount,
        mySlot,
        rounds,
        done,
        round: Math.floor(picks.length / teamCount) + 1,
        overall: picks.length + 1,
        picks: picks.map((id, i) => ({
          ...mockCard(ctx, id),
          overall: i + 1,
          teamIndex: snakeTeamIndex(i, teamCount),
          mine: snakeTeamIndex(i, teamCount) === myIndex,
        })),
        myRoster: myPicks.map((id) => mockCard(ctx, id)),
        advice: advice.map((a) => ({ ...a, ...mockCard(ctx, a.playerId) })),
      };
    },
  );

  app.post<{ Params: { id: string }; Body: MockBody }>(
    "/api/league/:id/mock/evaluate",
    async (req, reply) => {
      const ctx = buildLeagueContext(decodeURIComponent(req.params.id));
      if (!ctx) return reply.code(404).send({ error: "league not synced" });
      const teamCount = Math.min(Math.max(req.body?.teamCount ?? 10, 4), 16);
      const mySlot = Math.min(Math.max(req.body?.mySlot ?? 1, 1), teamCount);
      const picks = req.body?.picks ?? [];
      const teams: string[][] = Array.from({ length: teamCount }, () => []);
      picks.forEach((id, i) => teams[snakeTeamIndex(i, teamCount)]!.push(id));
      const report = evaluateMock({
        league: ctx.league,
        blends: ctx.seasonBlends,
        players: ctx.players,
        teams,
        myTeamIndex: mySlot - 1,
      });
      return {
        ...report,
        teams: report.teams.map((t) => ({
          ...t,
          starters: t.starters.map((s) => ({ ...s, ...mockCard(ctx, s.playerId), points: s.points })),
        })),
      };
    },
  );

  app.get<{ Params: { id: string } }>("/api/league/:id/draft/live", async (req, reply) => {
    const leagueId = decodeURIComponent(req.params.id);
    const ctx = buildLeagueContext(leagueId);
    if (!ctx) return reply.code(404).send({ error: "league not synced" });
    const config = getConfig();

    let picks: DraftPick[] = [];
    try {
      if (ctx.league.platform === "espn") {
        const raw = await fetchDraftRaw(
          {
            leagueId: config.espn.leagueId,
            s2: config.espn.s2 || undefined,
            swid: config.espn.swid || undefined,
          },
          config.season,
        );
        picks = mapEspnDraft(raw);
      } else {
        picks = mapYahooDraft(await fetchDraftResultsRaw(ctx.league.platformLeagueId));
      }
    } catch (err) {
      req.log.warn({ err }, "live draft fetch failed");
      return reply.code(502).send({ error: "couldn't reach the draft — cheat sheet still works" });
    }

    const myTeamId = ctx.league.myTeamId ?? "";
    const taken = new Set(picks.map((p) => p.playerId).filter((id): id is string => Boolean(id)));
    const myPicks = picks
      .filter((p) => p.teamId === myTeamId)
      .map((p) => p.playerId)
      .filter((id): id is string => Boolean(id));
    const recentPicks = picks
      .slice(-6)
      .map((p) => (p.playerId ? ctx.players.get(p.playerId)?.position : undefined))
      .filter((pos): pos is Position => Boolean(pos));
    const picksUntilNext = estimatePicksUntilNext(
      picks.map((p) => p.teamId),
      myTeamId,
      Math.max(ctx.league.teams.length, 1),
    );

    const advice = bestAvailable({
      league: ctx.league,
      blends: ctx.seasonBlends,
      vor: ctx.vor,
      players: ctx.players,
      taken,
      myPicks,
      recentPicks,
      picksUntilNext,
      limit: 10,
    });

    const card = (id: string | undefined, platformId: string) => {
      const p = id ? ctx.players.get(id) : undefined;
      return {
        id: id ?? platformId,
        name: p?.name ?? `#${platformId}`,
        position: p?.position ?? "?",
        team: p?.team,
      };
    };

    return {
      pickCount: picks.length,
      onTheClock: picksUntilNext === 0,
      picksUntilNext,
      recentPicks: picks.slice(-8).reverse().map((p) => ({
        ...card(p.playerId, p.platformPlayerId),
        overall: p.overall,
        pickedBy: ctx.league.teams.find((t) => t.id === p.teamId)?.name ?? p.teamId,
        mine: p.teamId === myTeamId,
      })),
      myPicks: myPicks.map((id) => ({
        ...card(id, id),
        seasonPoints: ctx.seasonBlends.get(id)?.points,
      })),
      advice: advice.map((a) => ({
        ...a,
        ...card(a.playerId, a.playerId),
        seasonPoints: ctx.seasonBlends.get(a.playerId)?.points,
      })),
    };
  });
}
