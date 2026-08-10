/** A trimmed but shape-faithful ESPN league response for mapper tests. */
export const espnLeagueFixture = {
  id: 12345,
  scoringPeriodId: 3,
  status: { currentMatchupPeriod: 3 },
  settings: {
    name: "Millman Bowl",
    scoringSettings: {
      scoringItems: [
        { statId: 3, points: 0.04 },
        { statId: 4, points: 4 },
        { statId: 20, points: -2 },
        { statId: 24, points: 0.1 },
        { statId: 25, points: 6 },
        { statId: 42, points: 0.1 },
        { statId: 43, points: 6 },
        { statId: 53, points: 1 },
        { statId: 72, points: -2 },
        { statId: 80, points: 3 },
        { statId: 77, points: 4 },
        { statId: 74, points: 5 },
        { statId: 86, points: 1 },
        { statId: 99, points: 1 },
        { statId: 95, points: 2 },
        { statId: 98, points: 6 },
      ],
    },
    rosterSettings: {
      lineupSlotCounts: {
        "0": 1, "2": 2, "4": 2, "6": 1, "16": 1, "17": 1, "20": 7, "21": 1, "23": 1,
      },
    },
    scheduleSettings: { matchupPeriodCount: 14 },
  },
  teams: [
    {
      id: 1,
      name: "Adam's Army",
      owners: ["{ADAM-SWID-GUID}"],
      record: { overall: { wins: 2, losses: 0, ties: 0, pointsFor: 250.5, pointsAgainst: 200.1 } },
      roster: {
        entries: [
          {
            lineupSlotId: 0,
            playerPoolEntry: {
              player: { id: 3139477, fullName: "Patrick Mahomes", defaultPositionId: 1, proTeamId: 12 },
            },
          },
          {
            lineupSlotId: 20,
            playerPoolEntry: {
              player: { id: 4362628, fullName: "Ja'Marr Chase", defaultPositionId: 3, proTeamId: 4 },
            },
          },
          {
            lineupSlotId: 16,
            playerPoolEntry: {
              player: { id: -16012, fullName: "Chiefs D/ST", defaultPositionId: 16, proTeamId: 12 },
            },
          },
        ],
      },
    },
    {
      id: 2,
      name: "Bench Warmers",
      owners: ["{OTHER-GUID}"],
      record: { overall: { wins: 0, losses: 2, ties: 0, pointsFor: 180.0, pointsAgainst: 230.4 } },
      roster: {
        entries: [
          {
            lineupSlotId: 2,
            playerPoolEntry: {
              player: { id: 9999999, fullName: "Unknown Rookie", defaultPositionId: 2, proTeamId: 3 },
            },
          },
        ],
      },
    },
  ],
  schedule: [
    { matchupPeriodId: 1, home: { teamId: 1, totalPoints: 120.2 }, away: { teamId: 2, totalPoints: 90.0 } },
    { matchupPeriodId: 3, home: { teamId: 2, totalPoints: 0 }, away: { teamId: 1, totalPoints: 0 } },
  ],
};

export const espnPoolFixture = {
  players: [
    {
      onTeamId: 1,
      player: {
        id: 3139477,
        fullName: "Patrick Mahomes",
        defaultPositionId: 1,
        proTeamId: 12,
        ownership: { percentOwned: 99.8 },
        draftRanksByRankType: { PPR: { rank: 20 } },
        stats: [
          { statSourceId: 1, scoringPeriodId: 3, seasonId: 2026, appliedTotal: 22.4 },
          { statSourceId: 1, scoringPeriodId: 0, seasonId: 2026, appliedTotal: 350.1 },
          { statSourceId: 0, scoringPeriodId: 2, seasonId: 2026, appliedTotal: 31.0 },
        ],
      },
    },
    {
      onTeamId: 0,
      player: {
        id: 4429795,
        fullName: "Jaylen Warren",
        defaultPositionId: 2,
        proTeamId: 23,
        ownership: { percentOwned: 55.2 },
        draftRanksByRankType: { PPR: { rank: 90 } },
        stats: [{ statSourceId: 1, scoringPeriodId: 3, seasonId: 2026, appliedTotal: 11.7 }],
      },
    },
  ],
};

export const espnProTeamsFixture = {
  settings: {
    proTeams: [
      { id: 12, byeWeek: 10 },
      { id: 4, byeWeek: 12 },
      { id: 28, byeWeek: 14 },
    ],
  },
};
