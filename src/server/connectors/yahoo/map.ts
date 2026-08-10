import type {
  FreeAgent,
  League,
  LeagueTeam,
  Matchup,
  Player,
  RosterSlot,
  ScoringRules,
} from "../../../core/types.js";
import type { PlayerIndex } from "../../players.js";
import { findByName } from "../../players.js";
import { dig, yahooCollection, yahooMerge } from "./parse.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Yahoo NFL stat_id → canonical stat key(s). Unknown ids are ignored. */
export const YAHOO_STAT_MAP: Record<number, string | string[]> = {
  4: "pass_yd",
  5: "pass_td",
  6: "pass_int",
  9: "rush_yd",
  10: "rush_td",
  11: "rec",
  12: "rec_yd",
  13: "rec_td",
  16: ["pass_2pt", "rush_2pt", "rec_2pt"], // Yahoo lumps 2-pt conversions
  18: "fum_lost",
  19: "fgm_0_19",
  20: "fgm_20_29",
  21: "fgm_30_39",
  22: "fgm_40_49",
  23: "fgm_50p",
  24: "fgmiss",
  25: "fgmiss",
  26: "fgmiss",
  27: "fgmiss",
  28: "fgmiss",
  29: "xpm",
  30: "xpmiss",
  32: "def_sack",
  33: "def_int",
  34: "def_fum_rec",
  35: "def_td",
  36: "def_safety",
  37: "blk_kick",
  50: "pts_allow_0",
  51: "pts_allow_1_6",
  52: "pts_allow_7_13",
  53: "pts_allow_14_20",
  54: "pts_allow_21_27",
  55: "pts_allow_28_34",
  56: "pts_allow_35p",
};

const SLOT_MAP: Record<string, RosterSlot> = {
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
  K: "K",
  DEF: "DST",
  "W/R/T": "FLEX",
  "W/R": "WRRB",
  "Q/W/R/T": "SUPERFLEX",
  BN: "BENCH",
  IR: "IR",
};

/** Yahoo team abbreviations → Sleeper's vocabulary. */
const TEAM_ALIASES: Record<string, string> = { WSH: "WAS", JAC: "JAX", LA: "LAR" };

export function normalizeTeamAbbr(abbr?: string): string | undefined {
  if (!abbr) return undefined;
  const up = abbr.toUpperCase();
  return TEAM_ALIASES[up] ?? up;
}

export function mapScoring(settingsRaw: any): ScoringRules {
  const settings = yahooMerge(dig(settingsRaw, "fantasy_content", "league", 1, "settings"));
  const modifiers = yahooCollection(dig(settings, "stat_modifiers", "stats")).length
    ? yahooCollection(dig(settings, "stat_modifiers", "stats"))
    : (dig(settings, "stat_modifiers", "stats") ?? []);
  const perStat: Record<string, number> = {};
  const list = Array.isArray(modifiers) ? modifiers : yahooCollection(modifiers);
  for (const entry of list) {
    const stat = entry?.stat ?? entry;
    const id = Number(stat?.stat_id);
    const value = Number(stat?.value);
    const keys = YAHOO_STAT_MAP[id];
    if (!keys || !Number.isFinite(value)) continue;
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      if (!(key in perStat)) perStat[key] = value;
    }
  }
  const rec = perStat.rec ?? 0;
  const label = rec >= 1 ? "PPR" : rec >= 0.5 ? "Half PPR" : rec > 0 ? `${rec} PPR` : "Standard";
  return { perStat, label };
}

export function mapLineupSlots(settingsRaw: any): Record<RosterSlot, number> {
  const settings = yahooMerge(dig(settingsRaw, "fantasy_content", "league", 1, "settings"));
  const positions = settings.roster_positions ?? [];
  const slots = {} as Record<RosterSlot, number>;
  const list = Array.isArray(positions) ? positions : yahooCollection(positions);
  for (const entry of list) {
    const rp = entry?.roster_position ?? entry;
    const slot = SLOT_MAP[rp?.position];
    const count = Number(rp?.count ?? 0);
    if (!slot || !count) continue;
    slots[slot] = (slots[slot] ?? 0) + count;
  }
  return slots;
}

export function leagueMeta(anyLeagueRaw: any): Record<string, any> {
  return yahooMerge(dig(anyLeagueRaw, "fantasy_content", "league", 0));
}

/** Resolve a Yahoo player entity (merged fragments) to the canonical universe. */
export function resolveYahooPlayer(index: PlayerIndex, merged: Record<string, any>): Player | undefined {
  const yahooId = merged.player_id != null ? String(merged.player_id) : undefined;
  if (yahooId) {
    const p = index.byYahooId.get(yahooId);
    if (p) return p;
  }
  const team = normalizeTeamAbbr(merged.editorial_team_abbr);
  const position = merged.display_position === "DEF" ? "DST" : merged.display_position;
  if (position === "DST" && team) {
    const dst = index.byId.get(team);
    if (dst) return dst;
  }
  const name = merged.name?.full;
  if (!name) return undefined;
  return findByName(index, name, position, team);
}

export function mapStandingsTeams(standingsRaw: any, index: PlayerIndex): LeagueTeam[] {
  const teamsObj = dig(standingsRaw, "fantasy_content", "league", 1, "standings", 0, "teams");
  return yahooCollection(teamsObj).map((t: any) => {
    const merged = yahooMerge(t.team);
    const standings = merged.team_standings ?? {};
    const outcomes = standings.outcome_totals ?? {};
    return {
      id: String(merged.team_id ?? merged.team_key),
      name: merged.name ?? `Team ${merged.team_id}`,
      ownerName: yahooCollection(merged.managers)
        .map((m: any) => m?.manager?.nickname)
        .filter(Boolean)
        .join(", ") || undefined,
      wins: Number(outcomes.wins ?? 0),
      losses: Number(outcomes.losses ?? 0),
      ties: Number(outcomes.ties ?? 0),
      pointsFor: Number(standings.points_for ?? 0),
      pointsAgainst: Number(standings.points_against ?? 0),
      roster: [], // filled per-team by the sync
    };
  });
}

export function mapRoster(
  rosterRaw: any,
  index: PlayerIndex,
): { roster: LeagueTeam["roster"]; unmapped: NonNullable<LeagueTeam["unmapped"]> } {
  const playersObj = dig(rosterRaw, "fantasy_content", "team", 1, "roster", "0", "players");
  const roster: LeagueTeam["roster"] = [];
  const unmapped: NonNullable<LeagueTeam["unmapped"]> = [];
  for (const entry of yahooCollection(playersObj)) {
    const fragments = entry.player;
    const merged = yahooMerge(Array.isArray(fragments) ? fragments[0] : fragments);
    const selected = yahooMerge(Array.isArray(fragments) ? fragments.slice(1) : []);
    const selectedPos = yahooMerge(selected.selected_position).position;
    const slot: RosterSlot = SLOT_MAP[selectedPos] ?? "BENCH";
    const player = resolveYahooPlayer(index, merged);
    if (player) {
      roster.push({ playerId: player.id, slot, platformPlayerId: String(merged.player_id) });
    } else if (merged.name?.full) {
      unmapped.push({ platformPlayerId: String(merged.player_id), name: merged.name.full });
    }
  }
  return { roster, unmapped };
}

export function mapScoreboard(scoreboardRaw: any): Matchup[] {
  const matchupsObj = dig(scoreboardRaw, "fantasy_content", "league", 1, "scoreboard", "0", "matchups");
  const out: Matchup[] = [];
  for (const m of yahooCollection(matchupsObj)) {
    const matchup = m.matchup;
    const week = Number(matchup?.week ?? 0);
    const teamsObj = dig(matchup, "0", "teams");
    const teams = yahooCollection(teamsObj).map((t: any) => {
      const merged = yahooMerge(t.team);
      return {
        id: String(merged.team_id ?? merged.team_key),
        points: Number(merged.team_points?.total ?? 0) || undefined,
      };
    });
    if (teams.length === 2) {
      out.push({
        week,
        homeTeamId: teams[0]!.id,
        awayTeamId: teams[1]!.id,
        homeScore: teams[0]!.points,
        awayScore: teams[1]!.points,
      });
    }
  }
  return out;
}

export function mapFreeAgentsPage(pageRaw: any, index: PlayerIndex, startRank: number): FreeAgent[] {
  const playersObj = dig(pageRaw, "fantasy_content", "league", 1, "players");
  const out: FreeAgent[] = [];
  yahooCollection(playersObj).forEach((entry: any, i: number) => {
    const fragments = entry.player;
    const merged = yahooMerge(Array.isArray(fragments) ? fragments[0] : fragments);
    const rest = yahooMerge(Array.isArray(fragments) ? fragments.slice(1) : []);
    const player = resolveYahooPlayer(index, merged);
    if (!player) return;
    const percentOwned = Number(yahooMerge(rest.percent_owned).value ?? NaN);
    out.push({
      playerId: player.id,
      platformPlayerId: String(merged.player_id),
      percentOwned: Number.isFinite(percentOwned) ? percentOwned : undefined,
      platformRank: startRank + i + 1, // position in Yahoo's rank-sorted FA list
    });
  });
  return out;
}

/** The user's leagues for the season, from the users;use_login=1 response. */
export function mapUserLeagues(raw: any): { leagueKey: string; name: string; scoringType?: string }[] {
  const out: { leagueKey: string; name: string; scoringType?: string }[] = [];
  for (const u of yahooCollection(dig(raw, "fantasy_content", "users"))) {
    const games = dig(yahooMerge(u.user), "games");
    for (const g of yahooCollection(games)) {
      const leagues = dig(yahooMerge(g.game), "leagues");
      for (const l of yahooCollection(leagues)) {
        const merged = yahooMerge(l.league);
        if (merged.league_key) {
          out.push({
            leagueKey: merged.league_key,
            name: merged.name ?? merged.league_key,
            scoringType: merged.scoring_type,
          });
        }
      }
    }
  }
  return out;
}

/** The user's own team_key within a league, from the users teams response. */
export function findMyTeamKey(raw: any, leagueKey: string): string | undefined {
  for (const u of yahooCollection(dig(raw, "fantasy_content", "users"))) {
    const games = dig(yahooMerge(u.user), "games");
    for (const g of yahooCollection(games)) {
      const teams = dig(yahooMerge(g.game), "teams");
      for (const t of yahooCollection(teams)) {
        const merged = yahooMerge(t.team);
        const teamKey: string | undefined = merged.team_key;
        if (teamKey?.startsWith(`${leagueKey}.t.`) && Number(merged.is_owned_by_current_login)) {
          return teamKey;
        }
      }
    }
  }
  return undefined;
}
