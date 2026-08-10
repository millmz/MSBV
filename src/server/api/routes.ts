import type { FastifyInstance } from "fastify";
import { getConfig } from "../config.js";

/** All authenticated JSON API routes. Grows with each milestone. */
export async function registerApiRoutes(app: FastifyInstance) {
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
