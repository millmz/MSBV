import React from "react";
import {
  LoadingOrError,
  NoLeague,
  PlayerLine,
  WeekPoints,
  useLeagueData,
  type PlayerCard,
} from "../components.js";

type LineupData = {
  gameState: { myProjected: number; oppProjected?: number; posture: string; explanation: string };
  totals: { points: number; floor: number; ceiling: number };
  lineup: (PlayerCard & { slot: string })[];
  bench: PlayerCard[];
  changes: { slot: string; delta: number; in: PlayerCard; out: PlayerCard }[];
};

export function Lineup() {
  const { data, error, loading, leagueSelected } = useLeagueData<LineupData>("/lineup");
  if (!leagueSelected) return <NoLeague />;
  if (loading || error) return <LoadingOrError loading={loading} error={error} />;
  if (!data) return null;

  return (
    <>
      <div className="card">
        <h2>This week's call</h2>
        <p className="muted">{data.gameState.explanation}</p>
        <p>
          Recommended lineup projects <b>{data.totals.points.toFixed(1)}</b>{" "}
          <span className="muted">
            (floor {data.totals.floor.toFixed(0)}, ceiling {data.totals.ceiling.toFixed(0)})
          </span>
        </p>
      </div>

      {data.changes.length > 0 && (
        <div className="card">
          <h2>Make these swaps</h2>
          {data.changes.map((c, i) => (
            <div key={i} style={{ borderBottom: "1px solid var(--line)", padding: "6px 0" }}>
              <PlayerLine p={c.in} right={<span className="good">START</span>} />
              <PlayerLine p={c.out} right={<span className="bad">SIT</span>} />
              <p className="muted" style={{ margin: "2px 0 4px" }}>
                {c.slot}: +{c.delta.toFixed(1)} projected points
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>Optimal lineup</h2>
        <table>
          <thead>
            <tr><th>Slot</th><th>Player</th><th className="num">Proj</th></tr>
          </thead>
          <tbody>
            {data.lineup.map((p, i) => (
              <tr key={i}>
                <td className="muted">{p.slot}</td>
                <td>
                  <b>{p.name}</b> <span className="muted">{p.team}</span>
                  {p.injuryStatus && <span className="warn"> {p.injuryStatus === "Questionable" ? "Q" : p.injuryStatus}</span>}
                </td>
                <td className="num"><WeekPoints p={p} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Bench</h2>
        {data.bench.map((p) => (
          <PlayerLine key={p.id} p={p} right={<WeekPoints p={p} />} />
        ))}
      </div>
    </>
  );
}
