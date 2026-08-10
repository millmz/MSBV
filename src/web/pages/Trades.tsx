import React, { useState } from "react";
import { api } from "../api.js";
import { useLeagues } from "../App.js";
import {
  LoadingOrError,
  NoLeague,
  PlayerLine,
  useLeagueData,
  type PlayerCard,
} from "../components.js";

type TradeData = {
  proposals: {
    targetTeamId: string;
    targetTeamName: string;
    give: PlayerCard[];
    get: PlayerCard[];
    myLineupDelta: number;
    theirLineupDelta: number;
    whyTheyAccept: string;
    notes: string[];
  }[];
};

type Evaluation = {
  verdict: string;
  explanation: string;
  lineupDelta: number;
  giveValue: number;
  getValue: number;
  give: PlayerCard[];
  get: PlayerCard[];
};

function TradeEvaluator() {
  const { selected } = useLeagues();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<(PlayerCard & { rosteredBy?: string })[]>([]);
  const [give, setGive] = useState<PlayerCard[]>([]);
  const [get, setGet] = useState<PlayerCard[]>([]);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async (q: string) => {
    setQuery(q);
    if (q.length < 2 || !selected) return setResults([]);
    const res = await api.get<{ players: (PlayerCard & { rosteredBy?: string })[] }>(
      `/api/league/${encodeURIComponent(selected)}/players/search?q=${encodeURIComponent(q)}`,
    );
    setResults(res.players);
  };

  const add = (p: PlayerCard, side: "give" | "get") => {
    (side === "give" ? setGive : setGet)((cur) =>
      cur.some((x) => x.id === p.id) ? cur : [...cur, p],
    );
    setResults([]);
    setQuery("");
    setEvaluation(null);
  };

  const evaluate = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await api.post<Evaluation>(
        `/api/league/${encodeURIComponent(selected)}/trade/evaluate`,
        { give: give.map((p) => p.id), get: get.map((p) => p.id) },
      );
      setEvaluation(res);
    } finally {
      setBusy(false);
    }
  };

  const verdictClass = (v: string) => (v === "accept" ? "good" : v === "reject" ? "bad" : "warn");

  return (
    <div className="card">
      <h2>Evaluate a trade</h2>
      <label>Search players (yours or anyone's)</label>
      <input value={query} onChange={(e) => void search(e.target.value)} placeholder="Type a name…" />
      {results.map((p) => (
        <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <PlayerLine p={p} right={<span className="muted">{p.rosteredBy ?? "FA"}</span>} />
          </div>
          <button className="ghost" onClick={() => add(p, "give")}>I give</button>
          <button className="ghost" onClick={() => add(p, "get")}>I get</button>
        </div>
      ))}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
        <div>
          <h3>You give</h3>
          {give.map((p) => (
            <div key={p.id} onClick={() => setGive((c) => c.filter((x) => x.id !== p.id))}>
              <PlayerLine p={p} right={<span className="muted">✕</span>} />
            </div>
          ))}
        </div>
        <div>
          <h3>You get</h3>
          {get.map((p) => (
            <div key={p.id} onClick={() => setGet((c) => c.filter((x) => x.id !== p.id))}>
              <PlayerLine p={p} right={<span className="muted">✕</span>} />
            </div>
          ))}
        </div>
      </div>
      <p>
        <button className="primary" disabled={busy || (give.length === 0 && get.length === 0)} onClick={evaluate}>
          {busy ? "Judging…" : "Judge this trade"}
        </button>
      </p>
      {evaluation && (
        <div>
          <p className={verdictClass(evaluation.verdict)} style={{ fontSize: "1.2rem", fontWeight: 800, textTransform: "uppercase" }}>
            {evaluation.verdict}
          </p>
          <p className="muted">{evaluation.explanation}</p>
          <p className="muted">
            Value: give {evaluation.giveValue.toFixed(0)} / get {evaluation.getValue.toFixed(0)} · lineup{" "}
            {evaluation.lineupDelta >= 0 ? "+" : ""}
            {evaluation.lineupDelta.toFixed(1)}
          </p>
        </div>
      )}
    </div>
  );
}

export function Trades() {
  const { data, error, loading, leagueSelected } = useLeagueData<TradeData>("/trades");
  if (!leagueSelected) return <NoLeague />;

  return (
    <>
      <TradeEvaluator />
      <div className="card">
        <h2>Trades to propose</h2>
        {(loading || error) && <LoadingOrError loading={loading} error={error} />}
        {data?.proposals.length === 0 && (
          <p className="muted">
            No clean surplus-for-surplus swaps found right now — check back after rosters shift.
          </p>
        )}
        {data?.proposals.map((p, i) => (
          <div key={i} style={{ borderBottom: "1px solid var(--line)", padding: "8px 0" }}>
            <p style={{ margin: "0 0 4px" }}>
              To <b>{p.targetTeamName}</b>{" "}
              <span className="good">+{p.myLineupDelta.toFixed(1)} for you</span>
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <h3>You send</h3>
                {p.give.map((pl) => <PlayerLine key={pl.id} p={pl} />)}
              </div>
              <div>
                <h3>You receive</h3>
                {p.get.map((pl) => <PlayerLine key={pl.id} p={pl} />)}
              </div>
            </div>
            <p className="muted" style={{ margin: "4px 0" }}>{p.whyTheyAccept}</p>
            {p.notes.map((n, j) => (
              <p key={j} className="muted" style={{ margin: "2px 0", fontSize: "0.8rem" }}>{n}</p>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
