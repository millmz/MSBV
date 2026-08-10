/** Shape-faithful Yahoo fantasy v2 JSON fixtures (their XML-as-JSON style). */

export const yahooSettingsFixture = {
  fantasy_content: {
    league: [
      {
        league_key: "461.l.777",
        league_id: "777",
        name: "Yahoo Bowl",
        season: "2026",
        current_week: 3,
        scoring_type: "head",
      },
      {
        settings: [
          {
            playoff_start_week: "15",
            roster_positions: [
              { roster_position: { position: "QB", count: 1 } },
              { roster_position: { position: "RB", count: 2 } },
              { roster_position: { position: "WR", count: 3 } },
              { roster_position: { position: "TE", count: 1 } },
              { roster_position: { position: "W/R/T", count: 1 } },
              { roster_position: { position: "K", count: 1 } },
              { roster_position: { position: "DEF", count: 1 } },
              { roster_position: { position: "BN", count: 5 } },
              { roster_position: { position: "IR", count: 2 } },
            ],
            stat_modifiers: {
              stats: [
                { stat: { stat_id: 4, value: "0.04" } },
                { stat: { stat_id: 5, value: "4" } },
                { stat: { stat_id: 6, value: "-1" } },
                { stat: { stat_id: 9, value: "0.1" } },
                { stat: { stat_id: 10, value: "6" } },
                { stat: { stat_id: 11, value: "0.5" } },
                { stat: { stat_id: 12, value: "0.1" } },
                { stat: { stat_id: 13, value: "6" } },
                { stat: { stat_id: 18, value: "-2" } },
                { stat: { stat_id: 32, value: "1" } },
                { stat: { stat_id: 50, value: "10" } },
              ],
            },
          },
        ],
      },
    ],
  },
};

export const yahooStandingsFixture = {
  fantasy_content: {
    league: [
      { league_key: "461.l.777" },
      {
        standings: [
          {
            teams: {
              "0": {
                team: [
                  [
                    { team_key: "461.l.777.t.1" },
                    { team_id: "1" },
                    { name: "Adam's Yahoo Squad" },
                    { managers: [{ manager: { nickname: "Adam" } }] },
                  ],
                  {
                    team_standings: {
                      rank: 1,
                      outcome_totals: { wins: "2", losses: "0", ties: "0" },
                      points_for: "241.10",
                      points_against: "198.55",
                    },
                  },
                ],
              },
              "1": {
                team: [
                  [
                    { team_key: "461.l.777.t.2" },
                    { team_id: "2" },
                    { name: "Rival" },
                  ],
                  {
                    team_standings: {
                      rank: 2,
                      outcome_totals: { wins: "0", losses: "2", ties: "0" },
                      points_for: "180.00",
                      points_against: "222.55",
                    },
                  },
                ],
              },
              count: 2,
            },
          },
        ],
      },
    ],
  },
};

export const yahooRosterFixture = {
  fantasy_content: {
    team: [
      [{ team_key: "461.l.777.t.1" }, { team_id: "1" }],
      {
        roster: {
          "0": {
            players: {
              "0": {
                player: [
                  [
                    { player_key: "461.p.30123" },
                    { player_id: "30123" },
                    { name: { full: "Patrick Mahomes" } },
                    { editorial_team_abbr: "KC" },
                    { display_position: "QB" },
                  ],
                  {
                    selected_position: [
                      { coverage_type: "week", week: "3" },
                      { position: "QB" },
                    ],
                  },
                ],
              },
              "1": {
                player: [
                  [
                    { player_key: "461.p.100022" },
                    { player_id: "100022" },
                    { name: { full: "Arizona" } },
                    { editorial_team_abbr: "Ari" },
                    { display_position: "DEF" },
                  ],
                  {
                    selected_position: [
                      { coverage_type: "week", week: "3" },
                      { position: "DEF" },
                    ],
                  },
                ],
              },
              "2": {
                player: [
                  [
                    { player_key: "461.p.99999" },
                    { player_id: "99999" },
                    { name: { full: "Total Unknown" } },
                    { editorial_team_abbr: "Chi" },
                    { display_position: "RB" },
                  ],
                  {
                    selected_position: [
                      { coverage_type: "week", week: "3" },
                      { position: "BN" },
                    ],
                  },
                ],
              },
              count: 3,
            },
          },
        },
      },
    ],
  },
};

export const yahooScoreboardFixture = {
  fantasy_content: {
    league: [
      { league_key: "461.l.777", current_week: 3 },
      {
        scoreboard: {
          "0": {
            matchups: {
              "0": {
                matchup: {
                  week: "3",
                  "0": {
                    teams: {
                      "0": {
                        team: [
                          [{ team_key: "461.l.777.t.1" }, { team_id: "1" }],
                          { team_points: { coverage_type: "week", week: "3", total: "88.4" } },
                        ],
                      },
                      "1": {
                        team: [
                          [{ team_key: "461.l.777.t.2" }, { team_id: "2" }],
                          { team_points: { coverage_type: "week", week: "3", total: "72.1" } },
                        ],
                      },
                      count: 2,
                    },
                  },
                },
              },
              count: 1,
            },
          },
        },
      },
    ],
  },
};

export const yahooFreeAgentsFixture = {
  fantasy_content: {
    league: [
      { league_key: "461.l.777" },
      {
        players: {
          "0": {
            player: [
              [
                { player_key: "461.p.40400" },
                { player_id: "40400" },
                { name: { full: "Jaylen Warren" } },
                { editorial_team_abbr: "Pit" },
                { display_position: "RB" },
              ],
              {
                percent_owned: [
                  { coverage_type: "week", week: "3" },
                  { value: 55 },
                ],
              },
            ],
          },
          count: 1,
        },
      },
    ],
  },
};

export const yahooUserLeaguesFixture = {
  fantasy_content: {
    users: {
      "0": {
        user: [
          { guid: "USERGUID" },
          {
            games: {
              "0": {
                game: [
                  { game_key: "461", code: "nfl", season: "2026" },
                  {
                    leagues: {
                      "0": {
                        league: [
                          { league_key: "461.l.777", name: "Yahoo Bowl", scoring_type: "head" },
                        ],
                      },
                      count: 1,
                    },
                  },
                ],
              },
              count: 1,
            },
          },
        ],
      },
      count: 1,
    },
  },
};

export const yahooUserTeamsFixture = {
  fantasy_content: {
    users: {
      "0": {
        user: [
          { guid: "USERGUID" },
          {
            games: {
              "0": {
                game: [
                  { game_key: "461", code: "nfl", season: "2026" },
                  {
                    teams: {
                      "0": {
                        team: [
                          [
                            { team_key: "461.l.777.t.1" },
                            { team_id: "1" },
                            { name: "Adam's Yahoo Squad" },
                            { is_owned_by_current_login: 1 },
                          ],
                        ],
                      },
                      count: 1,
                    },
                  },
                ],
              },
              count: 1,
            },
          },
        ],
      },
      count: 1,
    },
  },
};
