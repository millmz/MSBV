import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { getConfig, writeSettingsFile } from "../config.js";
import { syncYahooLeague } from "../connectors/yahoo/sync.js";
import { authorizeUrl, exchangeCode, clearTokenCache, useOob } from "../connectors/yahoo/oauth.js";
import { fetchUserLeaguesRaw } from "../connectors/yahoo/client.js";
import { mapUserLeagues } from "../connectors/yahoo/map.js";
import type { FastifyBaseLogger } from "fastify";

const STATE_COOKIE = "msbv_yahoo_state";

/** Post-token league discovery: auto-pick a lone NFL league, else ask. */
async function finishConnect(log: FastifyBaseLogger): Promise<"connected" | "pick_league"> {
  try {
    const leagues = mapUserLeagues(await fetchUserLeaguesRaw(getConfig().season));
    if (leagues.length === 1) {
      writeSettingsFile({ yahoo: { leagueKey: leagues[0]!.leagueKey } });
      await syncYahooLeague(log);
      return "connected";
    }
  } catch (err) {
    log.warn({ err }, "yahoo league discovery failed");
  }
  return "pick_league";
}

export async function registerYahooRoutes(app: FastifyInstance) {
  /** Step 1: save the dev-app credentials, hand back the consent URL. */
  app.post<{ Body: { clientId?: string; clientSecret?: string } }>(
    "/api/yahoo/app",
    async (req, reply) => {
      const { clientId, clientSecret } = req.body ?? {};
      if (!clientId?.trim() || !clientSecret?.trim()) {
        return reply.code(400).send({ error: "client ID and client secret are both required" });
      }
      writeSettingsFile({
        yahoo: { clientId: clientId.trim(), clientSecret: clientSecret.trim() },
      });
      clearTokenCache();
      const state = randomBytes(16).toString("hex");
      reply.setCookie(STATE_COOKIE, state, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 600,
      });
      return {
        authorizeUrl: authorizeUrl(state),
        mode: useOob() ? "oob" : "callback",
        redirectUri: `${getConfig().baseUrl}/api/yahoo/callback`,
      };
    },
  );

  /** Step 2 (oob mode): the user pastes the verification code Yahoo showed. */
  app.post<{ Body: { code?: string } }>("/api/yahoo/code", async (req, reply) => {
    const code = req.body?.code?.trim();
    if (!code) return reply.code(400).send({ error: "paste the verification code from Yahoo" });
    try {
      await exchangeCode(code);
    } catch (err) {
      req.log.warn({ err }, "yahoo oob code exchange failed");
      const detail = err instanceof Error ? err.message : "";
      return reply.code(400).send({
        error: `Yahoo rejected the code — codes are single-use and expire fast; try Connect again. ${detail}`.trim(),
      });
    }
    return { status: await finishConnect(req.log) };
  });

  /** Step 2: Yahoo redirects back here with a one-time code. */
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    "/api/yahoo/callback",
    async (req, reply) => {
      const { code, state, error } = req.query;
      if (error) return reply.redirect(`/connections?yahoo_error=${encodeURIComponent(error)}`);
      const expected = req.cookies?.[STATE_COOKIE];
      if (!code || !expected || state !== expected) {
        return reply.redirect("/connections?yahoo_error=state_mismatch");
      }
      try {
        await exchangeCode(code);
      } catch (err) {
        req.log.warn({ err }, "yahoo code exchange failed");
        return reply.redirect("/connections?yahoo_error=token_exchange_failed");
      }
      const status = await finishConnect(req.log);
      return reply.redirect(status === "connected" ? "/connections?yahoo=connected" : "/connections?yahoo=pick_league");
    },
  );

  /** League picker (when the login has several leagues). */
  app.get("/api/yahoo/leagues", async (req, reply) => {
    try {
      const leagues = mapUserLeagues(await fetchUserLeaguesRaw(getConfig().season));
      return { leagues };
    } catch (err) {
      return reply
        .code(400)
        .send({ error: err instanceof Error ? err.message : "Yahoo request failed" });
    }
  });

  app.post<{ Body: { leagueKey?: string } }>("/api/yahoo/league", async (req, reply) => {
    const leagueKey = req.body?.leagueKey?.trim();
    if (!leagueKey) return reply.code(400).send({ error: "leagueKey required" });
    writeSettingsFile({ yahoo: { leagueKey, teamKey: undefined } });
    const league = await syncYahooLeague(req.log);
    if (!league) return reply.code(400).send({ error: "sync failed — is Yahoo connected?" });
    return { ok: true, league: { id: league.id, name: league.name, scoringLabel: league.scoring.label } };
  });

  /** Surface the refresh token so the user can persist it as an env var on Render. */
  app.get("/api/yahoo/env", async () => {
    const c = getConfig().yahoo;
    return {
      YAHOO_CLIENT_ID: c.clientId || null,
      YAHOO_REFRESH_TOKEN: c.refreshToken || null,
      YAHOO_LEAGUE_KEY: c.leagueKey || null,
    };
  });
}
