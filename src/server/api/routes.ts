import type { FastifyInstance } from "fastify";
import { getConfig, writeSettingsFile } from "../config.js";
import { getLeagues } from "../leagues.js";
import { getPlayerIndex, normalizeName } from "../players.js";
import { storeAgeMs } from "../store.js";
import { runAllJobsNow } from "../sync/loop.js";
import { getNflWeek } from "../sync/spine.js";
import { syncEspnLeague } from "../connectors/espn/sync.js";
import { registerYahooRoutes } from "./yahoo-routes.js";
import { registerLeagueRoutes } from "./league-routes.js";

/** All authenticated JSON API routes. Grows with each milestone. */
export async function registerApiRoutes(app: FastifyInstance) {
  await registerYahooRoutes(app);
  await registerLeagueRoutes(app);
  app.get("/api/spine/status", async () => {
    const { season, week } = getNflWeek();
    const index = getPlayerIndex();
    const ageMin = (key: string) => {
      const age = storeAgeMs(key);
      return Number.isFinite(age) ? Math.round(age / 60_000) : null;
    };
    return {
      season,
      week,
      players: index.all.length,
      freshnessMinutes: {
        players: ageMin("players"),
        seasonProjections: ageMin(`projections_${season}_0`),
        weekProjections: week > 0 ? ageMin(`projections_${season}_${week}`) : null,
        trending: ageMin("trending"),
        usage: ageMin(`usage_${season}`) ?? ageMin(`usage_${season - 1}`),
        tiers: ageMin("tiers_ppr"),
      },
    };
  });

  app.get<{ Querystring: { q?: string } }>("/api/players/search", async (req) => {
    const q = normalizeName(req.query.q ?? "");
    if (q.length < 2) return { players: [] };
    const index = getPlayerIndex();
    const players = index.all
      .filter((p) => normalizeName(p.name).includes(q))
      .sort((a, b) => (a.searchRank ?? 1e9) - (b.searchRank ?? 1e9))
      .slice(0, 20);
    return { players };
  });

  app.post("/api/sync", async (req) => {
    const results = await runAllJobsNow(req.log);
    return { results };
  });

  app.get("/api/leagues", async () => {
    const leagues = getLeagues().map((l) => ({
      id: l.id,
      platform: l.platform,
      name: l.name,
      myTeamName: l.teams.find((t) => t.id === l.myTeamId)?.name,
      currentWeek: l.currentWeek,
      scoringLabel: l.scoring.label,
      syncedAt: l.syncedAt,
    }));
    return { leagues };
  });

  app.post<{
    Body: { leagueId?: string; s2?: string; swid?: string; teamId?: number };
  }>("/api/espn/connect", async (req, reply) => {
    const { leagueId, s2, swid, teamId } = req.body ?? {};
    if (!leagueId?.trim()) return reply.code(400).send({ error: "league ID is required" });
    let normalizedSwid = swid?.trim() ?? "";
    if (normalizedSwid && !normalizedSwid.startsWith("{")) normalizedSwid = `{${normalizedSwid}}`;
    writeSettingsFile({
      espn: { leagueId: leagueId.trim(), s2: s2?.trim(), swid: normalizedSwid, teamId },
    });
    try {
      const league = await syncEspnLeague(req.log);
      if (!league) return reply.code(400).send({ error: "player data still syncing — try again in a minute" });
      return {
        ok: true,
        league: {
          id: league.id,
          name: league.name,
          scoringLabel: league.scoring.label,
          teams: league.teams.map((t) => ({ id: t.id, name: t.name })),
          myTeamId: league.myTeamId,
        },
      };
    } catch (err) {
      const status = (err as { status?: number }).status;
      const hint =
        status === 401 || status === 403
          ? "ESPN rejected the credentials — for private leagues re-copy espn_s2 and SWID from your browser cookies"
          : status === 404
            ? "league not found — check the league ID and that the season is right"
            : `ESPN request failed: ${err instanceof Error ? err.message : String(err)}`;
      return reply.code(400).send({ error: hint });
    }
  });

  app.post<{ Body: { teamId?: number } }>("/api/espn/my-team", async (req, reply) => {
    if (req.body?.teamId === undefined) return reply.code(400).send({ error: "teamId required" });
    writeSettingsFile({ espn: { teamId: req.body.teamId } });
    await syncEspnLeague(req.log);
    return { ok: true };
  });
  app.get("/api/config", async () => {
    const c = getConfig();
    // Never echo secrets back — only presence flags the UI needs.
    return {
      season: c.season,
      espn: { leagueId: c.espn.leagueId, connected: Boolean(c.espn.leagueId) },
      yahoo: {
        appConfigured: Boolean(c.yahoo.clientId && c.yahoo.clientSecret),
        connected: Boolean(c.yahoo.refreshToken),
        leagueKey: c.yahoo.leagueKey,
      },
    };
  });
}
