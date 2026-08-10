/**
 * The normalized model. Both league connectors (ESPN, Yahoo) map into these
 * shapes; the engine and UI only ever see this vocabulary.
 */

export type Position = "QB" | "RB" | "WR" | "TE" | "K" | "DST";
export const POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "K", "DST"];

/** Canonical player record, keyed by Sleeper ID (the cross-platform join key). */
export type Player = {
  id: string; // sleeper id
  name: string;
  position: Position;
  /** NFL team abbreviation, e.g. "KC"; undefined for free agents/retired. */
  team?: string;
  espnId?: string;
  yahooId?: string;
  gsisId?: string; // nflverse join key
  /** Sleeper injury status: Questionable, Doubtful, Out, IR, PUP, Sus, NA... */
  injuryStatus?: string;
  byeWeek?: number;
  age?: number;
  yearsExp?: number;
  /** Sleeper search rank — a serviceable free ADP/market-value proxy. */
  searchRank?: number;
  depthChartOrder?: number;
};

/**
 * Raw projected stat line (Sleeper stat vocabulary, adopted as canonical):
 * pass_yd, pass_td, pass_int, rush_yd, rush_td, rec, rec_yd, rec_td,
 * fum_lost, bonus_rec_te, xpm, fgm_0_19..fgm_50p, defensive stats, etc.
 */
export type StatLine = Record<string, number>;

export type ProjectionSource = "sleeper" | "espn" | "yahoo";

export type PlayerProjection = {
  playerId: string;
  source: ProjectionSource;
  season: number;
  /** 0 = full-season projection. */
  week: number;
  stats: StatLine;
  /** Pre-computed points in the source's default scoring, when the source provides it. */
  defaultPoints?: number;
};

/** Scoring rules normalized to points-per-stat over the canonical StatLine keys. */
export type ScoringRules = {
  /** e.g. { pass_yd: 0.04, pass_td: 4, rec: 1, rec_yd: 0.1, ... } */
  perStat: Record<string, number>;
  /** Human label: "PPR", "Half PPR", "Standard", or "Custom". */
  label: string;
};

export type RosterSlot =
  | Position
  | "FLEX" // RB/WR/TE
  | "SUPERFLEX" // QB/RB/WR/TE
  | "WRRB" // WR/RB
  | "BENCH"
  | "IR";

export const FLEX_ELIGIBLE: Record<string, Position[]> = {
  FLEX: ["RB", "WR", "TE"],
  SUPERFLEX: ["QB", "RB", "WR", "TE"],
  WRRB: ["RB", "WR"],
};

export type LeaguePlatform = "espn" | "yahoo";

export type LeagueTeam = {
  id: string;
  name: string;
  ownerName?: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  /** Player IDs (canonical/Sleeper) currently on the roster, with slot info. */
  roster: { playerId: string; slot: RosterSlot; platformPlayerId: string }[];
  /** Players the connector couldn't map to the canonical universe. */
  unmapped?: { platformPlayerId: string; name: string }[];
};

export type Matchup = {
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore?: number;
  awayScore?: number;
};

export type FreeAgent = {
  playerId: string;
  platformPlayerId: string;
  /** Platform's own rank/ownership signals — inputs to the mispricing detector. */
  percentOwned?: number;
  platformRank?: number;
  platformProjection?: number;
  waiverStatus?: string;
};

export type League = {
  id: string; // "espn:12345" | "yahoo:nfl.l.678"
  platform: LeaguePlatform;
  platformLeagueId: string;
  name: string;
  season: number;
  currentWeek: number;
  scoring: ScoringRules;
  /** Starting lineup composition, e.g. { QB:1, RB:2, WR:2, TE:1, FLEX:1, K:1, DST:1, BENCH:7 } */
  lineupSlots: Record<RosterSlot, number>;
  teams: LeagueTeam[];
  myTeamId?: string;
  matchups: Matchup[];
  freeAgents: FreeAgent[];
  playoffWeekStart?: number;
  syncedAt: string; // ISO timestamp
};

/** Weekly usage line from nflverse (per player-week). */
export type UsageWeek = {
  gsisId: string;
  week: number;
  team?: string;
  targets?: number;
  receptions?: number;
  carries?: number;
  passAttempts?: number;
  rushYards?: number;
  recYards?: number;
  rushTds?: number;
  recTds?: number;
  /** Share of team targets (0..1) when derivable. */
  targetShare?: number;
  airYardsShare?: number;
  redzoneTouches?: number;
  fantasyPointsPpr?: number;
  fantasyPointsStd?: number;
};

export type TierChart = {
  /** "ppr" | "half" | "std" */
  scoring: string;
  position: Position | "FLEX";
  /** tiers[0] = tier 1 player names in rank order. */
  tiers: string[][];
  fetchedAt: string;
};

export type TrendingPlayer = {
  playerId: string;
  /** Number of adds/drops in the lookback window across all Sleeper leagues. */
  count: number;
  direction: "add" | "drop";
};
