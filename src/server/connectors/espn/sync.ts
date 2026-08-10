import type { FastifyBaseLogger } from "fastify";
import type { League, Player } from "../../../core/types.js";
import { getConfig } from "../../config.js";
import { getPlayerIndex } from "../../players.js";
import { storeGet, storeSet } from "../../store.js";
import { registerSyncJob } from "../../sync/loop.js";
import { fetchLeagueRaw, fetchPlayerPoolRaw, fetchProTeamsRaw } from "./client.js";
import { mapByeWeeks, mapEspnLeague, mapPlayerPool, poolToFreeAgents } from "./map.js";

const MINUTE = 60_000;

/** One full ESPN league sync: league snapshot + player pool + byes. */
export async function syncEspnLeague(log: FastifyBaseLogger): Promise<League | undefined> {
  const config = getConfig();
  const { leagueId, s2, swid, teamId } = config.espn;
  if (!leagueId) return undefined;

  const index = getPlayerIndex();
  if (index.all.length === 0) {
    log.info("espn sync waiting for player universe");
    return undefined;
  }

  const auth = { leagueId, s2: s2 || undefined, swid: swid || undefined };
  const raw = await fetchLeagueRaw(auth, config.season);
  const league = mapEspnLeague(raw, index, config.season, { swid, myTeamId: teamId });

  const scoringPeriodId = (raw as { scoringPeriodId?: number })?.scoringPeriodId ?? 1;
  try {
    const poolRaw = await fetchPlayerPoolRaw(auth, config.season, scoringPeriodId);
    const pool = mapPlayerPool(poolRaw, index, scoringPeriodId, config.season);
    storeSet("espn_pool", pool);
    const rostered = new Set(league.teams.flatMap((t) => t.roster.map((r) => r.playerId)));
    league.freeAgents = poolToFreeAgents(pool, rostered);
  } catch (err) {
    log.warn({ err }, "espn player pool fetch failed — keeping league without FA list");
  }

  storeSet("league_espn", league);
  log.info(
    { league: league.name, teams: league.teams.length, freeAgents: league.freeAgents.length },
    "espn league synced",
  );
  return league;
}

/** Fill bye weeks onto the stored player universe (ESPN is the free source). */
export async function syncByeWeeks(log: FastifyBaseLogger): Promise<void> {
  const config = getConfig();
  const raw = await fetchProTeamsRaw(config.season);
  const byes = mapByeWeeks(raw);
  if (Object.keys(byes).length === 0) return;
  storeSet("bye_weeks", byes);
  const players = storeGet<Player[]>("players");
  if (players) {
    for (const p of players) {
      if (p.team && byes[p.team]) p.byeWeek = byes[p.team];
    }
    storeSet("players", players);
  }
  log.info({ teams: Object.keys(byes).length }, "bye weeks synced");
}

export function registerEspnJobs() {
  registerSyncJob({
    name: "espn-league",
    intervalMs: 30 * MINUTE,
    run: async (log) => {
      await syncEspnLeague(log);
    },
  });
  registerSyncJob({
    name: "espn-bye-weeks",
    intervalMs: 24 * 60 * MINUTE,
    run: async (log) => {
      await syncByeWeeks(log);
    },
  });
}
