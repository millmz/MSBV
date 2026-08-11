import type { FastifyInstance } from "fastify";
import type { Player } from "../../core/types.js";
import { buildLeagueContext, type LeagueContext } from "../engine/context.js";
import { recommendLineup } from "../engine/lineup.js";
import { evaluateTrade, findTrades } from "../engine/trades.js";
import { computeWaivers, streamOfTheWeek } from "../engine/waivers.js";
import { getPlayerIndex, normalizeName } from "../players.js";

/** League-scoped engine endpoints. `:id` is "espn:123" / "yahoo:nfl.l.456". */

function playerCard(p: Player | undefined, ctx: LeagueContext, id: string) {
  const blend = ctx.weekBlends.get(id);
  const season = ctx.seasonBlends.get(id);
  return {
    id,
    name: p?.name ?? id,
    position: p?.position ?? "?",
    team: p?.team,
    injuryStatus: p?.injuryStatus,
    byeWeek: p?.byeWeek,
    week: blend ? { points: blend.points, floor: blend.floor, ceiling: blend.ceiling, volatile: blend.volatile } : undefined,
    season: season ? { points: season.points } : undefined,
    vor: ctx.vor.get(id)?.vor,
    tier: ctx.vor.get(id)?.tier,
    positionRank: ctx.vor.get(id)?.positionRank,
    usage: ctx.usage.get(id),
  };
}

export async function registerLeagueRoutes(app: FastifyInstance) {
  const withContext = (id: string) => buildLeagueContext(decodeURIComponent(id));

  app.get<{ Params: { id: string } }>("/api/league/:id/overview", async (req, reply) => {
    const ctx = withContext(req.params.id);
    if (!ctx) return reply.code(404).send({ error: "league not synced" });
    const { league } = ctx;
    const myTeam = league.teams.find((t) => t.id === league.myTeamId);
    const matchup = league.matchups.find(
      (m) => m.week === league.currentWeek && myTeam && (m.homeTeamId === myTeam.id || m.awayTeamId === myTeam.id),
    );
    const oppId = matchup ? (matchup.homeTeamId === myTeam?.id ? matchup.awayTeamId : matchup.homeTeamId) : undefined;
    const lineupRec = myTeam ? recommendLineup(league, myTeam, ctx.weekBlends, ctx.players) : undefined;
    const injuries = (myTeam?.roster ?? [])
      .map((r) => ctx.players.get(r.playerId))
      .filter((p): p is Player => Boolean(p?.injuryStatus))
      .map((p) => ({ id: p.id, name: p.name, position: p.position, status: p.injuryStatus }));
    return {
      league: {
        id: league.id, platform: league.platform, name: league.name,
        week: league.currentWeek, scoringLabel: league.scoring.label, syncedAt: league.syncedAt,
      },
      myTeam: myTeam
        ? { id: myTeam.id, name: myTeam.name, record: `${myTeam.wins}-${myTeam.losses}${myTeam.ties ? `-${myTeam.ties}` : ""}` }
        : undefined,
      opponent: oppId
        ? { id: oppId, name: league.teams.find((t) => t.id === oppId)?.name }
        : undefined,
      gameState: lineupRec?.gameState,
      lineupChanges: lineupRec?.changes.length ?? 0,
      injuries,
      standings: [...league.teams]
        .sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor)
        .map((t) => ({ id: t.id, name: t.name, record: `${t.wins}-${t.losses}`, pointsFor: Math.round(t.pointsFor) })),
    };
  });

  app.get<{ Params: { id: string } }>("/api/league/:id/lineup", async (req, reply) => {
    const ctx = withContext(req.params.id);
    if (!ctx) return reply.code(404).send({ error: "league not synced" });
    const myTeam = ctx.league.teams.find((t) => t.id === ctx.league.myTeamId);
    if (!myTeam) return reply.code(400).send({ error: "pick your team on the Setup page first" });
    const rec = recommendLineup(ctx.league, myTeam, ctx.weekBlends, ctx.players);
    return {
      gameState: rec.gameState,
      totals: { points: rec.totalPoints, floor: rec.totalFloor, ceiling: rec.totalCeiling },
      lineup: rec.lineup.map((pick) => ({
        slot: pick.slot,
        ...playerCard(ctx.players.get(pick.playerId), ctx, pick.playerId),
      })),
      bench: myTeam.roster
        .filter((r) => !rec.lineup.some((p) => p.playerId === r.playerId))
        .map((r) => playerCard(ctx.players.get(r.playerId), ctx, r.playerId))
        .sort((a, b) => (b.week?.points ?? 0) - (a.week?.points ?? 0)),
      changes: rec.changes.map((c) => ({
        slot: c.slot,
        delta: c.delta,
        in: playerCard(ctx.players.get(c.in), ctx, c.in),
        out: playerCard(ctx.players.get(c.out), ctx, c.out),
      })),
    };
  });

  app.get<{ Params: { id: string } }>("/api/league/:id/waivers", async (req, reply) => {
    const ctx = withContext(req.params.id);
    if (!ctx) return reply.code(404).send({ error: "league not synced" });
    const { targets, drops } = computeWaivers({
      league: ctx.league,
      seasonBlends: ctx.seasonBlends,
      weekBlends: ctx.weekBlends,
      vor: ctx.vor,
      players: ctx.players,
      trending: ctx.trending,
      usage: ctx.usage,
      mispricings: ctx.mispricings,
    });
    const streams = (["DST", "K", "TE"] as const)
      .map((pos) => {
        const s = streamOfTheWeek(ctx.league, ctx.weekBlends, ctx.players, pos);
        return s ? { ...playerCard(ctx.players.get(s.playerId), ctx, s.playerId), position: pos } : undefined;
      })
      .filter(Boolean);
    return {
      targets: targets.map((t) => ({
        ...playerCard(ctx.players.get(t.playerId), ctx, t.playerId),
        score: t.score,
        reasons: t.reasons,
        trendingAdds: t.trendingAdds,
        upgradeOver: t.upgradeOver
          ? { ...t.upgradeOver, name: ctx.players.get(t.upgradeOver.playerId)?.name }
          : undefined,
        suggestedDrop: t.suggestedDrop
          ? { id: t.suggestedDrop, name: ctx.players.get(t.suggestedDrop)?.name }
          : undefined,
      })),
      drops: drops.map((d) => ({
        ...playerCard(ctx.players.get(d.playerId), ctx, d.playerId),
        reason: d.reason,
      })),
      streams,
    };
  });

  app.get<{ Params: { id: string } }>("/api/league/:id/trades", async (req, reply) => {
    const ctx = withContext(req.params.id);
    if (!ctx) return reply.code(404).send({ error: "league not synced" });
    const proposals = findTrades({
      league: ctx.league,
      seasonBlends: ctx.seasonBlends,
      vor: ctx.vor,
      players: ctx.players,
      mispricings: ctx.mispricings,
    });
    return {
      proposals: proposals.map((p) => ({
        ...p,
        give: p.give.map((id) => playerCard(ctx.players.get(id), ctx, id)),
        get: p.get.map((id) => playerCard(ctx.players.get(id), ctx, id)),
      })),
    };
  });

  app.post<{ Params: { id: string }; Body: { give?: string[]; get?: string[] } }>(
    "/api/league/:id/trade/evaluate",
    async (req, reply) => {
      const ctx = withContext(req.params.id);
      if (!ctx) return reply.code(404).send({ error: "league not synced" });
      const give = req.body?.give ?? [];
      const get = req.body?.get ?? [];
      if (give.length === 0 && get.length === 0) {
        return reply.code(400).send({ error: "add players to at least one side" });
      }
      const result = evaluateTrade({
        league: ctx.league,
        give,
        get,
        seasonBlends: ctx.seasonBlends,
        vor: ctx.vor,
        players: ctx.players,
      });
      return {
        ...result,
        give: give.map((id) => playerCard(ctx.players.get(id), ctx, id)),
        get: get.map((id) => playerCard(ctx.players.get(id), ctx, id)),
      };
    },
  );

  app.get<{ Params: { id: string } }>("/api/league/:id/edge", async (req, reply) => {
    const ctx = withContext(req.params.id);
    if (!ctx) return reply.code(404).send({ error: "league not synced" });
    const enrich = (playerId: string) => playerCard(ctx.players.get(playerId), ctx, playerId);
    const regression = [...ctx.usage.values()]
      .filter((u) => u.flag)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 20);
    return {
      mispricings: ctx.mispricings.slice(0, 25).map((m) => ({ ...m, player: enrich(m.playerId) })),
      regression: regression.map((u) => ({ ...u, player: enrich(u.playerId) })),
      volatile: [...ctx.weekBlends.values()]
        .filter((b) => b.volatile && b.points >= 8)
        .sort((a, b) => b.points - a.points)
        .slice(0, 12)
        .map((b) => ({ ...enrich(b.playerId), sources: b.sources })),
    };
  });

  /** Roster search within a league (trade evaluator picker). */
  app.get<{ Params: { id: string }; Querystring: { view?: string } }>(
    "/api/league/:id/ranks",
    async (req, reply) => {
      const ctx = withContext(req.params.id);
      if (!ctx) return reply.code(404).send({ error: "league not synced" });
      const view = req.query.view === "ros" ? "ros" : "week";
      const rosteredBy = new Map<string, string>();
      for (const team of ctx.league.teams) {
        for (const r of team.roster) rosteredBy.set(r.playerId, team.name);
      }

      // K/DST never belong at the top of a board — variance swamps any
      // projected edge — so they sort behind skill players in every view.
      const late = (pos?: string) => (pos === "K" || pos === "DST" || pos === "DEF" ? 1 : 0);
      // ...but the row cap must never squeeze them off the board entirely.
      const capWithKd = <T extends { position?: string }>(sorted: T[], cap: number): T[] => [
        ...sorted.filter((r) => !late(r.position)).slice(0, cap),
        ...sorted.filter((r) => late(r.position)).slice(0, 40),
      ];

      if (view === "ros") {
        // Rest of season: FantasyPros ROS ECR ordering where available,
        // season blend as the fallback spine so the board never goes empty.
        const ids = new Set<string>([...ctx.fpRos.keys()]);
        for (const [id, blend] of ctx.seasonBlends) if (blend.points > 0) ids.add(id);
        const rows = [...ids]
          .map((id) => ({
            ...playerCard(ctx.players.get(id), ctx, id),
            rosRank: ctx.fpRos.get(id)?.rank,
            rosTier: ctx.fpRos.get(id)?.tier,
            rosteredBy: rosteredBy.get(id),
          }))
          .sort((a, b) => {
            const lateDiff = late(a.position) - late(b.position);
            if (lateDiff !== 0) return lateDiff;
            if (a.rosRank !== undefined && b.rosRank !== undefined) return a.rosRank - b.rosRank;
            if (a.rosRank !== undefined) return -1;
            if (b.rosRank !== undefined) return 1;
            return (b.season?.points ?? 0) - (a.season?.points ?? 0);
          });
        return { view, week: ctx.week, hasFpRos: ctx.fpRos.size > 0, rows: capWithKd(rows, 220) };
      }

      if (ctx.week === 0) return { view, week: 0, rows: [] };
      const ids = new Set<string>([...ctx.fpWeekRanks.keys()]);
      for (const [id, blend] of ctx.weekBlends) if (blend.points > 0) ids.add(id);
      const rows = [...ids]
        .map((id) => ({
          ...playerCard(ctx.players.get(id), ctx, id),
          weekPosRank: ctx.fpWeekRanks.get(id),
          rosteredBy: rosteredBy.get(id),
        }))
        .sort(
          (a, b) =>
            late(a.position) - late(b.position) || (b.week?.points ?? 0) - (a.week?.points ?? 0),
        );
      return { view, week: ctx.week, hasFpWeek: ctx.fpWeekRanks.size > 0, rows: capWithKd(rows, 220) };
    },
  );

  app.get<{ Params: { id: string }; Querystring: { q?: string } }>(
    "/api/league/:id/players/search",
    async (req, reply) => {
      const ctx = withContext(req.params.id);
      if (!ctx) return reply.code(404).send({ error: "league not synced" });
      const q = normalizeName(req.query.q ?? "");
      if (q.length < 2) return { players: [] };
      const index = getPlayerIndex();
      const rosteredBy = new Map<string, string>();
      for (const team of ctx.league.teams) {
        for (const r of team.roster) rosteredBy.set(r.playerId, team.name);
      }
      const players = index.all
        .filter((p) => normalizeName(p.name).includes(q))
        .sort((a, b) => (ctx.vor.get(b.id)?.vor ?? -99) - (ctx.vor.get(a.id)?.vor ?? -99))
        .slice(0, 12)
        .map((p) => ({ ...playerCard(p, ctx, p.id), rosteredBy: rosteredBy.get(p.id) }));
      return { players };
    },
  );
}
