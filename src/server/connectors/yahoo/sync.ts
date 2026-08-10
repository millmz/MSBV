import type { FastifyBaseLogger } from "fastify";
import type { League, LeagueTeam } from "../../../core/types.js";
import { getConfig, writeSettingsFile } from "../../config.js";
import { getPlayerIndex } from "../../players.js";
import { storeSet } from "../../store.js";
import { registerSyncJob } from "../../sync/loop.js";
import {
  fetchFreeAgentsPageRaw,
  fetchLeagueScoreboardRaw,
  fetchLeagueSettingsRaw,
  fetchLeagueStandingsRaw,
  fetchTeamRosterRaw,
  fetchUserTeamsRaw,
} from "./client.js";
import {
  findMyTeamKey,
  leagueMeta,
  mapFreeAgentsPage,
  mapLineupSlots,
  mapRoster,
  mapScoreboard,
  mapScoring,
  mapStandingsTeams,
} from "./map.js";
import { dig, yahooMerge } from "./parse.js";

const MINUTE = 60_000;

export async function syncYahooLeague(log: FastifyBaseLogger): Promise<League | undefined> {
  const config = getConfig();
  const { refreshToken, leagueKey } = config.yahoo;
  if (!refreshToken || !leagueKey) return undefined;

  const index = getPlayerIndex();
  if (index.all.length === 0) {
    log.info("yahoo sync waiting for player universe");
    return undefined;
  }

  const settingsRaw = await fetchLeagueSettingsRaw(leagueKey);
  const meta = leagueMeta(settingsRaw);
  const standingsRaw = await fetchLeagueStandingsRaw(leagueKey);
  const teams = mapStandingsTeams(standingsRaw, index);

  // Rosters, one call per team.
  for (const team of teams) {
    const teamKey = `${leagueKey}.t.${team.id}`;
    try {
      const rosterRaw = await fetchTeamRosterRaw(teamKey);
      const { roster, unmapped } = mapRoster(rosterRaw, index);
      team.roster = roster;
      if (unmapped.length > 0) team.unmapped = unmapped;
    } catch (err) {
      log.warn({ err, teamKey }, "yahoo roster fetch failed");
    }
  }

  // Free agents: top 100 by Yahoo rank, with ownership.
  const freeAgents = [];
  for (const start of [0, 25, 50, 75]) {
    try {
      const page = await fetchFreeAgentsPageRaw(leagueKey, start);
      freeAgents.push(...mapFreeAgentsPage(page, index, start));
    } catch (err) {
      log.warn({ err, start }, "yahoo FA page fetch failed");
      break;
    }
  }

  const currentWeek = Number(meta.current_week ?? 1);
  let matchups: League["matchups"] = [];
  try {
    matchups = mapScoreboard(await fetchLeagueScoreboardRaw(leagueKey, currentWeek));
  } catch (err) {
    log.warn({ err }, "yahoo scoreboard fetch failed");
  }

  // My team: persisted pick, or auto-detect from the login's teams.
  let myTeamKey = config.yahoo.teamKey;
  if (!myTeamKey) {
    try {
      myTeamKey = findMyTeamKey(await fetchUserTeamsRaw(config.season), leagueKey);
      if (myTeamKey) writeSettingsFile({ yahoo: { teamKey: myTeamKey } });
    } catch (err) {
      log.warn({ err }, "yahoo my-team lookup failed");
    }
  }

  const settingsMerged = leagueSettingsMerged(settingsRaw);
  const league: League = {
    id: `yahoo:${leagueKey}`,
    platform: "yahoo",
    platformLeagueId: leagueKey,
    name: meta.name ?? "Yahoo League",
    season: Number(meta.season ?? config.season),
    currentWeek,
    scoring: mapScoring(settingsRaw),
    lineupSlots: mapLineupSlots(settingsRaw),
    teams: teams as LeagueTeam[],
    myTeamId: myTeamKey?.split(".t.")[1],
    matchups,
    freeAgents,
    playoffWeekStart: settingsMerged.playoff_start_week
      ? Number(settingsMerged.playoff_start_week)
      : undefined,
    syncedAt: new Date().toISOString(),
  };

  storeSet("league_yahoo", league);
  log.info(
    { league: league.name, teams: league.teams.length, freeAgents: league.freeAgents.length },
    "yahoo league synced",
  );
  return league;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function leagueSettingsMerged(settingsRaw: any) {
  return yahooMerge(dig(settingsRaw, "fantasy_content", "league", 1, "settings"));
}

export function registerYahooJobs() {
  registerSyncJob({
    name: "yahoo-league",
    intervalMs: 30 * MINUTE,
    run: async (log) => {
      await syncYahooLeague(log);
    },
  });
}
