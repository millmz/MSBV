import { HttpError } from "../../http.js";
import { getAccessToken } from "./oauth.js";

const BASE = "https://fantasysports.yahooapis.com/fantasy/v2";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** GET a fantasy v2 resource path, JSON format, bearer-authenticated. */
export async function yahooGet(path: string): Promise<any> {
  const token = await getAccessToken();
  const sep = path.includes("?") ? "&" : "?";
  const url = `${BASE}/${path}${sep}format=json`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new HttpError(res.status, url, `Yahoo API ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

/** The signed-in user's NFL leagues for a season. */
export function fetchUserLeaguesRaw(season: number): Promise<any> {
  return yahooGet(`users;use_login=1/games;game_codes=nfl;seasons=${season}/leagues`);
}

/** The signed-in user's NFL teams (to find which league team is theirs). */
export function fetchUserTeamsRaw(season: number): Promise<any> {
  return yahooGet(`users;use_login=1/games;game_codes=nfl;seasons=${season}/teams`);
}

export function fetchLeagueSettingsRaw(leagueKey: string): Promise<any> {
  return yahooGet(`league/${leagueKey}/settings`);
}

export function fetchLeagueStandingsRaw(leagueKey: string): Promise<any> {
  return yahooGet(`league/${leagueKey}/standings`);
}

export function fetchLeagueScoreboardRaw(leagueKey: string, week?: number): Promise<any> {
  return yahooGet(`league/${leagueKey}/scoreboard${week ? `;week=${week}` : ""}`);
}

export function fetchTeamRosterRaw(teamKey: string): Promise<any> {
  return yahooGet(`team/${teamKey}/roster/players`);
}

/** One page (25) of free agents sorted by Yahoo's overall rank, with ownership. */
export function fetchFreeAgentsPageRaw(leagueKey: string, start: number): Promise<any> {
  return yahooGet(
    `league/${leagueKey}/players;status=FA;sort=AR;count=25;start=${start}/percent_owned`,
  );
}

export function fetchDraftResultsRaw(leagueKey: string): Promise<any> {
  return yahooGet(`league/${leagueKey}/draftresults`);
}
