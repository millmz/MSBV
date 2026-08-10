import React from "react";
import {
  LoadingOrError,
  NoLeague,
  PlayerLine,
  useLeagueData,
  type PlayerCard,
} from "../components.js";

type EdgeData = {
  mispricings: {
    playerId: string;
    platformRank: number;
    blendRank: number;
    edge: number;
    verdict: string;
    explanation: string;
    onMyTeam: boolean;
    rostered: boolean;
    player: PlayerCard;
  }[];
  regression: {
    playerId: string;
    delta: number;
    flag?: string;
    explanation?: string;
    player: PlayerCard;
  }[];
  volatile: (PlayerCard & { sources: Record<string, number> })[];
};

export function EdgeReport() {
  const { data, error, loading, leagueSelected } = useLeagueData<EdgeData>("/edge");
  if (!leagueSelected) return <NoLeague />;
  if (loading || error) return <LoadingOrError loading={loading} error={error} />;
  if (!data) return null;

  const targets = data.mispricings.filter((m) => m.verdict === "target");
  const fades = data.mispricings.filter((m) => m.verdict === "fade");

  return (
    <>
      <div className="card">
        <h2>⚡ Platform mispricings</h2>
        <p className="muted">
          Your leaguemates act on the platform's default ranks. These are the gaps between those
          ranks and the consensus blend — visible only to you.
        </p>
        <h3>Targets (platform undervalues)</h3>
        {targets.length === 0 && <p className="muted">None big enough right now.</p>}
        {targets.map((m) => (
          <div key={m.playerId}>
            <PlayerLine
              p={m.player}
              right={
                <span>
                  <span className="good">+{m.edge}</span>{" "}
                  {m.onMyTeam ? <span className="pill up">yours</span> : m.rostered ? <span className="pill">rostered</span> : <span className="pill up">FA</span>}
                </span>
              }
            />
            <p className="muted" style={{ margin: "0 0 8px 30px", fontSize: "0.8rem" }}>{m.explanation}</p>
          </div>
        ))}
        <h3>Fades (platform props them up)</h3>
        {fades.map((m) => (
          <div key={m.playerId}>
            <PlayerLine
              p={m.player}
              right={
                <span>
                  <span className="bad">{m.edge}</span>{" "}
                  {m.onMyTeam && <span className="pill down">sell high</span>}
                </span>
              }
            />
            <p className="muted" style={{ margin: "0 0 8px 30px", fontSize: "0.8rem" }}>{m.explanation}</p>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>📈 Usage vs. output (regression radar)</h2>
        <p className="muted">
          Opportunity converted to expected points vs. what actually scored. Usage leads; box
          scores lag.
        </p>
        {data.regression.length === 0 && (
          <p className="muted">Needs a few weeks of the season's usage data — check back after games.</p>
        )}
        {data.regression.map((r) => (
          <div key={r.playerId}>
            <PlayerLine
              p={r.player}
              right={
                <span className={r.flag === "buy-low" ? "good" : "bad"}>
                  {r.flag === "buy-low" ? "BUY LOW" : "SELL HIGH"}
                </span>
              }
            />
            <p className="muted" style={{ margin: "0 0 8px 30px", fontSize: "0.8rem" }}>{r.explanation}</p>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>🌪 Volatile this week</h2>
        <p className="muted">Projection sources disagree hard on these — boom/bust starts.</p>
        {data.volatile.map((p) => (
          <div key={p.id}>
            <PlayerLine
              p={p}
              right={
                <span className="muted" style={{ fontSize: "0.8rem" }}>
                  {Object.entries(p.sources).map(([s, v]) => `${s} ${v.toFixed(1)}`).join(" / ")}
                </span>
              }
            />
          </div>
        ))}
      </div>
    </>
  );
}
