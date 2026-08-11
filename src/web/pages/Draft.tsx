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

type MockCard = { id: string; name: string; position: string; team?: string; seasonPoints?: number };
type MockState = {
  teamCount: number;
  mySlot: number;
  rounds: number;
  done: boolean;
  round: number;
  overall: number;
  picks: (MockCard & { overall: number; teamIndex: number; mine: boolean })[];
  myRoster: MockCard[];
  advice: (MockCard & { score: number; vor: number; tier: number; reasons: string[] })[];
};
type MockReport = {
  myRank: number;
  myStarterPoints: number;
  fieldAverage: number;
  positionEdges: { position: string; mine: number; fieldAvg: number }[];
  teams: { teamIndex: number; mine: boolean; rank: number; starterPoints: number; starters: (MockCard & { slot: string; points: number })[] }[];
};

function MockRoom() {
  const { selected } = useLeagues();
  const [teamCount, setTeamCount] = useState(10);
  const [slot, setSlot] = useState(5);
  const [state, setState] = useState<MockState | null>(null);
  const [report, setReport] = useState<MockReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const call = async <T,>(path: string, body: unknown): Promise<T> =>
    api.post<T>(`/api/league/${encodeURIComponent(selected!)}/mock/${path}`, body);

  const evaluate = async (s: MockState) => {
    const rep = await call<MockReport>("evaluate", {
      teamCount: s.teamCount,
      mySlot: s.mySlot,
      picks: s.picks.map((p) => p.id),
    });
    setReport(rep);
  };

  const advance = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const res = await call<MockState>("advance", body);
      setState(res);
      if (res.done) await evaluate(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  const start = () => {
    setReport(null);
    void advance({ teamCount, mySlot: slot, picks: [] });
  };
  const pick = (id: string) => {
    if (!state) return;
    void advance({
      teamCount: state.teamCount,
      mySlot: state.mySlot,
      rounds: state.rounds,
      picks: state.picks.map((p) => p.id),
      myPickId: id,
    });
  };
  const reset = () => {
    setState(null);
    setReport(null);
  };

  return (
    <div className="card">
      <h2>
        Mock draft{" "}
        {state && (
          <button className="ghost" style={{ float: "right" }} onClick={reset}>
            {report ? "New mock" : "Abandon"}
          </button>
        )}
      </h2>

      {!state && (
        <>
          <p className="muted">
            Practice against a room that drafts the way leaguemates do — off the platform's market
            ranks — while you draft off the value board. Uses this league's exact scoring and
            roster shape; the report card at the end shows whether the arbitrage showed up.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label>Teams</label>
              <select value={teamCount} onChange={(e) => { const n = Number(e.target.value); setTeamCount(n); setSlot(Math.min(slot, n)); }}>
                {[8, 10, 12, 14].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label>Your pick</label>
              <select value={slot} onChange={(e) => setSlot(Number(e.target.value))}>
                {Array.from({ length: teamCount }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>#{n}</option>
                ))}
              </select>
            </div>
          </div>
          <p>
            <button className="primary" onClick={start} disabled={busy}>
              {busy ? "Setting up…" : "Start mock draft"}
            </button>
          </p>
        </>
      )}

      {error && <p className="bad">{error}</p>}

      {state && !state.done && (
        <>
          <p>
            <b className="good">You're on the clock</b>
            <span className="muted"> · round {state.round} of {state.rounds} · pick #{state.overall}</span>
          </p>
          <h3>The board says</h3>
          {state.advice.slice(0, 5).map((a) => (
            <div key={a.id} style={{ borderBottom: "1px solid var(--line)", padding: "7px 0" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <PlayerAvatar id={a.id} name={a.name} position={a.position} team={a.team} size={28} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>{a.name}</b> <span className="muted">{a.team}</span> <PosPill position={a.position} />
                  <p className="muted" style={{ margin: "1px 0 0", fontSize: "0.78rem" }}>{a.reasons.join(" ")}</p>
                </span>
                <span className="num muted" style={{ fontSize: "0.8rem" }}>T{a.tier} · {a.seasonPoints?.toFixed(0)}</span>
                <button className="primary" style={{ padding: "7px 13px" }} disabled={busy} onClick={() => pick(a.id)}>
                  Draft
                </button>
              </div>
            </div>
          ))}
          <p>
            <button className="ghost" disabled={busy || state.advice.length === 0} onClick={() => pick(state.advice[0]!.id)}>
              {busy ? "Simulating…" : "Auto-pick best"}
            </button>
          </p>
          {state.picks.length > 0 && (
            <>
              <h3>Last picks</h3>
              {state.picks.slice(-6).reverse().map((p) => (
                <p key={p.overall} style={{ margin: "3px 0", fontSize: "0.85rem" }}>
                  <span className="muted">#{p.overall}</span> <PosPill position={p.position} /> {p.name}{" "}
                  <span className={p.mine ? "good" : "muted"}>— {p.mine ? "YOU" : `Team ${p.teamIndex + 1}`}</span>
                </p>
              ))}
            </>
          )}
          <h3>Your roster</h3>
          {state.myRoster.length === 0 && <p className="muted">No picks yet.</p>}
          {state.myRoster.map((p) => (
            <p key={p.id} style={{ margin: "3px 0" }}>
              <PosPill position={p.position} /> {p.name}{" "}
              <span className="num muted">{p.seasonPoints?.toFixed(0)} pts</span>
            </p>
          ))}
        </>
      )}

      {report && (
        <>
          <div className="statrow">
            <div className="stat">
              <div className={`stat-num ${report.myRank === 1 ? "good" : report.myRank <= 3 ? "" : "warn"}`}>
                #{report.myRank}
              </div>
              <div className="stat-label">of {report.teams.length} teams</div>
            </div>
            <div className="stat">
              <div className="stat-num">{report.myStarterPoints.toFixed(0)}</div>
              <div className="stat-label">Your starters · proj</div>
            </div>
            <div className="stat">
              <div className="stat-num muted">{report.fieldAverage.toFixed(0)}</div>
              <div className="stat-label">Field average</div>
            </div>
          </div>
          <h3>Where you won (and didn't)</h3>
          <table>
            <thead><tr><th>Slot group</th><th className="num">You</th><th className="num">Field avg</th><th className="num">Edge</th></tr></thead>
            <tbody>
              {report.positionEdges.map((e) => {
                const edge = e.mine - e.fieldAvg;
                return (
                  <tr key={e.position}>
                    <td>{e.position}</td>
                    <td className="num">{e.mine.toFixed(0)}</td>
                    <td className="num">{e.fieldAvg.toFixed(0)}</td>
                    <td className={`num ${edge > 0 ? "good" : edge < 0 ? "bad" : ""}`}>
                      {edge > 0 ? "+" : ""}{edge.toFixed(0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <h3>Your starting lineup</h3>
          {report.teams.find((t) => t.mine)?.starters.map((s) => (
            <div key={s.id} className="player-line">
              <PlayerAvatar id={s.id} name={s.name} position={s.position} team={s.team} size={28} />
              <span className="player-line-name">
                <b>{s.name}</b>
                <span className="player-line-meta">
                  <span className="muted">{s.slot}</span> <PosPill position={s.position} />
                </span>
              </span>
              <span className="num">{s.points.toFixed(0)}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export function Draft() {
  const { data, error, loading, leagueSelected } = useLeagueData<CheatSheet>("/draft/cheatsheet");
  const [posFilter, setPosFilter] = useState("ALL");
  const [mode, setMode] = useState<"mock" | "live">("mock");
  if (!leagueSelected) return <NoLeague />;

  const rows = data?.rows.filter((r) => posFilter === "ALL" || r.position === posFilter) ?? [];

  return (
    <>
      <div className="league-toggle" style={{ marginBottom: 14, display: "inline-flex" }}>
        <button className={mode === "mock" ? "active" : ""} onClick={() => setMode("mock")}>Mock draft</button>
        <button className={mode === "live" ? "active" : ""} onClick={() => setMode("live")}>Draft day</button>
      </div>
      {mode === "mock" ? <MockRoom /> : <LiveRoom />}
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
