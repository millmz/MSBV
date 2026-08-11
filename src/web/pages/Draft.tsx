import React, { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useLeagues } from "../App.js";
import { LoadingOrError, NoLeague, PlayerAvatar, PosPill, useLeagueData } from "../components.js";

type CheatSheet = {
  scoringLabel: string;
  rows: {
    playerId: string;
    overallRank: number;
    positionRank: number;
    tier: number;
    points: number;
    vor: number;
    adp?: number;
    value?: number;
    ecr?: number;
    name: string;
    position?: string;
    team?: string;
    byeWeek?: number;
    injuryStatus?: string;
  }[];
};

type LiveDraft = {
  pickCount: number;
  onTheClock: boolean;
  picksUntilNext: number;
  recentPicks: { overall: number; pickedBy: string; mine: boolean; name: string; position: string }[];
  myPicks: { id: string; name: string; position: string; seasonPoints?: number }[];
  advice: {
    playerId: string;
    name: string;
    position: string;
    team?: string;
    score: number;
    vor: number;
    tier: number;
    reasons: string[];
    seasonPoints?: number;
  }[];
};

function LiveRoom() {
  const { selected } = useLeagues();
  const [data, setData] = useState<LiveDraft | null>(null);
  const [error, setError] = useState("");
  const [polling, setPolling] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  const poll = async () => {
    if (!selected) return;
    try {
      const res = await api.get<LiveDraft>(`/api/league/${encodeURIComponent(selected)}/draft/live`);
      setData(res);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    }
  };

  const toggle = () => {
    if (polling) {
      clearInterval(timer.current);
      setPolling(false);
    } else {
      void poll();
      timer.current = setInterval(() => void poll(), 6000);
      setPolling(true);
    }
  };
  useEffect(() => () => clearInterval(timer.current), []);

  return (
    <div className="card">
      <h2>
        Live draft room{" "}
        <button className={polling ? "ghost" : "primary"} style={{ float: "right" }} onClick={toggle}>
          {polling ? "Stop" : "Go live"}
        </button>
      </h2>
      {!polling && !data && (
        <p className="muted">
          On draft day hit <b>Go live</b> — picks sync every few seconds, taken players drop off,
          and the advice panel reranks for <i>your</i> roster.
        </p>
      )}
      {error && <p className="bad">{error}</p>}
      {data && (
        <>
          <p>
            {data.onTheClock ? (
              <b className="good">YOU'RE ON THE CLOCK</b>
            ) : (
              <span>
                <b>{data.picksUntilNext}</b> picks until your turn · {data.pickCount} made
              </span>
            )}
          </p>
          <h3>Take next</h3>
          {data.advice.map((a, i) => (
            <div key={a.playerId} style={{ borderBottom: "1px solid var(--line)", padding: "6px 0" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="muted">{i + 1}.</span>
                <PosPill position={a.position} />
                <b style={{ flex: 1 }}>
                  {a.name} <span className="muted">{a.team}</span>
                </b>
                <span className="num">
                  T{a.tier} · {a.seasonPoints?.toFixed(0)} pts
                </span>
              </div>
              <p className="muted" style={{ margin: "2px 0 0 26px", fontSize: "0.8rem" }}>
                {a.reasons.join(" ")}
              </p>
            </div>
          ))}
          <h3>Last picks</h3>
          {data.recentPicks.map((p) => (
            <p key={p.overall} style={{ margin: "3px 0", fontSize: "0.85rem" }}>
              <span className="muted">#{p.overall}</span> <PosPill position={p.position} /> {p.name}{" "}
              <span className={p.mine ? "good" : "muted"}>— {p.mine ? "YOU" : p.pickedBy}</span>
            </p>
          ))}
          <h3>Your roster so far</h3>
          {data.myPicks.length === 0 && <p className="muted">No picks yet.</p>}
          {data.myPicks.map((p) => (
            <p key={p.id} style={{ margin: "3px 0" }}>
              <PosPill position={p.position} /> {p.name}
            </p>
          ))}
        </>
      )}
    </div>
  );
}

export function Draft() {
  const { data, error, loading, leagueSelected } = useLeagueData<CheatSheet>("/draft/cheatsheet");
  const [posFilter, setPosFilter] = useState("ALL");
  if (!leagueSelected) return <NoLeague />;

  const rows = data?.rows.filter((r) => posFilter === "ALL" || r.position === posFilter) ?? [];

  return (
    <>
      <LiveRoom />
      <div className="card">
        <h2>
          Cheat sheet <span className="muted">({data?.scoringLabel})</span>
        </h2>
        <div className="league-toggle" style={{ marginBottom: 8, flexWrap: "wrap" }}>
          {["ALL", "QB", "RB", "WR", "TE", "K", "DST"].map((pos) => (
            <button key={pos} className={posFilter === pos ? "active" : ""} onClick={() => setPosFilter(pos)}>
              {pos}
            </button>
          ))}
        </div>
        {(loading || error) && <LoadingOrError loading={loading} error={error} />}
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>#</th><th>Player</th><th>Tier</th>
                <th className="num">Pts</th><th className="num">VOR</th><th className="num">Val</th><th className="num">ECR</th><th className="num">Bye</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.playerId}>
                  <td className="muted">{r.overallRank}</td>
                  <td>
                    <span className="cell-player">
                      <PlayerAvatar id={r.playerId} name={r.name} position={r.position} team={r.team} size={26} />
                      <span>
                        <b>{r.name}</b> <span className="muted">{r.team}</span>{" "}
                        <PosPill position={r.position ?? "?"} />
                        {r.injuryStatus && <span className="warn"> {r.injuryStatus === "Questionable" ? "Q" : r.injuryStatus}</span>}
                      </span>
                    </span>
                  </td>
                  <td className="muted">T{r.tier}</td>
                  <td className="num">{r.points.toFixed(0)}</td>
                  <td className="num">{r.vor.toFixed(0)}</td>
                  <td className={`num ${r.value !== undefined && r.value > 5 ? "good" : ""}`}>
                    {r.value !== undefined ? (r.value > 0 ? `+${r.value}` : r.value) : "—"}
                  </td>
                  <td className="num muted">{r.ecr ?? "—"}</td>
                  <td className="num muted">{r.byeWeek ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: "0.75rem" }}>
          Val = market ADP minus our rank: positive means the market lets him fall to you.
        </p>
      </div>
    </>
  );
}
