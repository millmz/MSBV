import type { FastifyInstance } from "fastify";
import { getConfig } from "../config.js";
import { getPlayerIndex, normalizeName } from "../players.js";
import { storeAgeMs } from "../store.js";
import { runAllJobsNow } from "../sync/loop.js";
import { getNflWeek } from "../sync/spine.js";

/** All authenticated JSON API routes. Grows with each milestone. */
export async function registerApiRoutes(app: FastifyInstance) {
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
