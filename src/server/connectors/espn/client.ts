import { fetchJson } from "../../http.js";

/**
 * ESPN's (unofficial but long-stable) fantasy v3 read API. Private leagues
 * authenticate with two browser cookies: espn_s2 and SWID.
 */

const HOST = "https://lm-api-reads.fantasy.espn.com";

export type EspnAuth = {
  leagueId: string;
  s2?: string;
  swid?: string;
};

function headers(auth: EspnAuth, extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/json",
    ...extra,
  };
  if (auth.s2 && auth.swid) {
    h.Cookie = `espn_s2=${auth.s2}; SWID=${auth.swid}`;
  }
  return h;
}

function leagueUrl(season: number, leagueId: string): string {
  return `${HOST}/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}`;
}

/** League snapshot: settings, teams, rosters, matchups, status in one call. */
export async function fetchLeagueRaw(auth: EspnAuth, season: number): Promise<unknown> {
  const views = ["mSettings", "mTeam", "mRoster", "mMatchupScore", "mStatus"];
  const url = `${leagueUrl(season, auth.leagueId)}?${views.map((v) => `view=${v}`).join("&")}`;
  return fetchJson(url, { headers: headers(auth) });
}

/**
 * Player pool with ESPN's own ranks/projections/ownership — the top N by
 * percent-owned, including who holds them (onTeamId; 0 = free agent).
 * This feeds both the free-agent list and the mispricing detector.
 */
export async function fetchPlayerPoolRaw(
  auth: EspnAuth,
  season: number,
  scoringPeriodId: number,
  limit = 400,
): Promise<unknown> {
  const filter = {
    players: {
      filterActive: { value: true },
      limit,
      sortPercOwned: { sortAsc: false, sortPriority: 1 },
    },
  };
  const url = `${leagueUrl(season, auth.leagueId)}?scoringPeriodId=${scoringPeriodId}&view=kona_player_info`;
  return fetchJson(url, {
    headers: headers(auth, { "X-Fantasy-Filter": JSON.stringify(filter) }),
    timeoutMs: 30_000,
  });
}

/** Draft state (used by the live draft room). */
export async function fetchDraftRaw(auth: EspnAuth, season: number): Promise<unknown> {
  const url = `${leagueUrl(season, auth.leagueId)}?view=mDraftDetail`;
  return fetchJson(url, { headers: headers(auth) });
}

/** NFL pro-team schedules — the free source for bye weeks. */
export async function fetchProTeamsRaw(season: number): Promise<unknown> {
  const url = `${HOST}/apis/v3/games/ffl/seasons/${season}?view=proTeamSchedules_wl`;
  return fetchJson(url, { headers: { Accept: "application/json" } });
}
