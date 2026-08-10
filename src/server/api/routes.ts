import type { FastifyInstance } from "fastify";
import { getConfig, writeSettingsFile } from "../config.js";
import { getLeagues } from "../leagues.js";
import { findByName, getPlayerIndex, normalizeName } from "../players.js";
import { storeAgeMs, storeGet, storeSet } from "../store.js";
import {
  detectFpKind,
  parseFpProjections,
  parseFpRankings,
  type FpProjectionRow,
  type FpRankingRow,
} from "../connectors/fantasypros/parse.js";
import { markFpManualUpload } from "../connectors/fantasypros/sync.js";
import { runAllJobsNow } from "../sync/loop.js";
import { getNflWeek } from "../sync/spine.js";
import { syncEspnLeague } from "../connectors/espn/sync.js";
import { registerYahooRoutes } from "./yahoo-routes.js";
import { registerLeagueRoutes } from "./league-routes.js";
import { registerDraftRoutes } from "./draft-routes.js";

/** All authenticated JSON API routes. Grows with each milestone. */
export async function registerApiRoutes(app: FastifyInstance) {
  await registerYahooRoutes(app);
  await registerLeagueRoutes(app);
  await registerDraftRoutes(app);
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
        fantasypros: (() => {
          const ages = ["ppr", "half", "std"]
            .flatMap((s) => [ageMin(`fp_rankings_${s}`), ageMin(`fp_projections_${s}`)])
            .filter((v): v is number => v !== null);
          return ages.length ? Math.min(...ages) : null;
        })(),
      },
    };
  });

  const FP_SCORINGS = ["ppr", "half", "std"] as const;

  app.post<{ Body: { scoring?: string; csv?: string } }>(
    "/api/fantasypros/upload",
    async (req, reply) => {
      const scoring = FP_SCORINGS.find((s) => s === req.body?.scoring) ?? "ppr";
      const csv = req.body?.csv;
      if (!csv?.trim()) {
        return reply.code(400).send({ error: "Empty file — export a CSV from FantasyPros first." });
      }
      const kind = detectFpKind(csv);
      if (!kind) {
        return reply.code(400).send({
          error:
            "That doesn't look like a FantasyPros export — expected RK + PLAYER NAME columns (rankings) or Player + FPTS columns (projections).",
        });
      }
      const rows = kind === "rankings" ? parseFpRankings(csv) : parseFpProjections(csv);
      if (rows.length === 0) {
        return reply.code(400).send({ error: "Recognized the format but found no player rows." });
      }
      const index = getPlayerIndex();
      const matched = rows.filter((r) => findByName(index, r.name, r.position, r.team)).length;
      storeSet(`fp_${kind}_${scoring}`, rows);
      markFpManualUpload(`fp_${kind}_${scoring}`);
      req.log.info({ kind, scoring, rows: rows.length, matched }, "fantasypros upload stored");
      return { kind, scoring, rows: rows.length, matched };
    },
  );

  app.get("/api/fantasypros/status", async () => {
    const datasets: {
      kind: "rankings" | "projections";
      scoring: string;
      rows: number;
      ageMinutes: number;
    }[] = [];
    for (const scoring of FP_SCORINGS) {
      for (const kind of ["rankings", "projections"] as const) {
        const rows = storeGet<(FpRankingRow | FpProjectionRow)[]>(`fp_${kind}_${scoring}`);
        const age = storeAgeMs(`fp_${kind}_${scoring}`);
        if (rows && Number.isFinite(age)) {
          datasets.push({ kind, scoring, rows: rows.length, ageMinutes: Math.round(age / 60_000) });
        }
      }
    }
    return { datasets };
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
