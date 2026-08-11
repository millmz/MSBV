import React from "react";
import { Link } from "react-router-dom";
import { useLeagues } from "../App.js";
import { LoadingOrError, PlayerAvatar, useLeagueData } from "../components.js";
import { LemonGlyph } from "../icons.js";

type Overview = {
  league: { name: string; week: number; scoringLabel: string; syncedAt: string };
  myTeam?: { name: string; record: string };
  opponent?: { name?: string };
  gameState?: { myProjected: number; oppProjected?: number; posture: string; explanation: string };
  lineupChanges: number;
  injuries: { id: string; name: string; position: string; status?: string }[];
  standings: { id: string; name: string; record: string; pointsFor: number }[];
};

export function Dashboard() {
  const { leagues } = useLeagues();
  const { data, error, loading, leagueSelected } = useLeagueData<Overview>("/overview");

  if (leagues.length === 0) {
    return (
      <div className="card">
        <h2>Welcome to Lemon League</h2>
        <p className="muted">
          No leagues connected yet. Head to <Link to="/connections">Setup</Link> to link your ESPN
          and Yahoo leagues — a few minutes each, then everything here lights up.
        </p>
      </div>
    );
  }
  if (!leagueSelected) return null;
  if (loading || error) return <LoadingOrError loading={loading} error={error} />;
  if (!data) return null;

  const gs = data.gameState;
  const postureClass =
    gs?.posture === "favored" ? "good" : gs?.posture === "underdog" ? "bad" : "warn";

  return (
    <>
      <div className="card">
        <h2>
          {data.league.name} <span className="muted">· {data.league.scoringLabel} · Week {data.league.week}</span>
        </h2>
        {data.myTeam && (
          <p>
            <b>{data.myTeam.name}</b> <span className="muted">({data.myTeam.record})</span>
            {data.opponent?.name && <span> vs <b>{data.opponent.name}</b></span>}
          </p>
        )}
        {gs && (
          <>
            <div className="statrow">
              <div className="stat">
                <div className={`stat-num ${postureClass}`}>{gs.myProjected.toFixed(1)}</div>
                <div className="stat-label">You · projected</div>
              </div>
              {gs.oppProjected !== undefined && (
                <>
                  <div className="stat-vs">vs</div>
                  <div className="stat">
                    <div className="stat-num">{gs.oppProjected.toFixed(1)}</div>
                    <div className="stat-label">Opponent · projected</div>
                  </div>
                </>
              )}
            </div>
            <p className="muted" style={{ marginTop: 6 }}>{gs.explanation}</p>
          </>
        )}
        {data.lineupChanges > 0 && (
          <p>
            <Link to="/lineup">
              <b>{data.lineupChanges} lineup {data.lineupChanges === 1 ? "change" : "changes"} recommended →</b>
            </Link>
          </p>
        )}
      </div>

      {data.injuries.length > 0 && (
        <div className="card">
          <h2>Injury watch</h2>
          {data.injuries.map((p) => (
            <div key={p.id} className="player-line">
              <PlayerAvatar id={p.id} name={p.name} position={p.position} />
              <span className="player-line-name">
                <b>{p.name}</b>
                <span className="player-line-meta">
                  <span className={`pill pos-${p.position}`}>{p.position}</span>
                </span>
              </span>
              <span className={p.status === "Questionable" ? "warn" : "bad"}>{p.status}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>Standings</h2>
        <table>
          <thead>
            <tr><th>Team</th><th className="num">Record</th><th className="num">PF</th></tr>
          </thead>
          <tbody>
            {data.standings.map((t, i) => (
              <tr key={t.id} style={data.myTeam && t.name === data.myTeam.name ? { fontWeight: 700 } : undefined}>
                <td>
                  {t.name}
                  {i === data.standings.length - 1 && data.standings.length > 1 && (
                    <span title="current lemon seat — lose the league, eat the lemon">
                      {" "}
                      <LemonGlyph size={13} />
                    </span>
                  )}
                </td>
                <td className="num">{t.record}</td>
                <td className="num">{t.pointsFor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted" style={{ textAlign: "center", fontSize: "0.75rem" }}>
        Synced {new Date(data.league.syncedAt).toLocaleString()}
      </p>
    </>
  );
}
