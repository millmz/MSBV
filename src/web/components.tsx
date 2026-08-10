import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import { useLeagues } from "./App.js";

/** Player shape returned by the league API endpoints. */
export type PlayerCard = {
  id: string;
  name: string;
  position: string;
  team?: string;
  injuryStatus?: string;
  byeWeek?: number;
  week?: { points: number; floor: number; ceiling: number; volatile: boolean };
  season?: { points: number };
  vor?: number;
  tier?: number;
  positionRank?: number;
  usage?: { flag?: string; explanation?: string; expectedPpg: number; actualPpg: number };
};

/** Fetch a league-scoped endpoint whenever the selected league changes. */
export function useLeagueData<T>(path: string): {
  data: T | null;
  error: string;
  loading: boolean;
  reload: () => void;
  leagueSelected: boolean;
} {
  const { selected } = useLeagues();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setError("");
    api
      .get<T>(`/api/league/${encodeURIComponent(selected)}${path}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "failed"))
      .finally(() => setLoading(false));
  }, [selected, path, nonce]);

  return {
    data,
    error,
    loading,
    reload: () => setNonce((n) => n + 1),
    leagueSelected: Boolean(selected),
  };
}

export function PosPill({ position }: { position: string }) {
  return <span className={`pill pos-${position}`}>{position}</span>;
}

export function Injury({ status }: { status?: string }) {
  if (!status) return null;
  const short = status === "Questionable" ? "Q" : status === "Doubtful" ? "D" : status;
  return (
    <span className={status === "Questionable" ? "warn" : "bad"} title={status}>
      {" "}
      {short}
    </span>
  );
}

export function PlayerLine({ p, right }: { p: PlayerCard; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
      <PosPill position={p.position} />
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <b>{p.name}</b>
        <span className="muted"> {p.team}</span>
        <Injury status={p.injuryStatus} />
      </span>
      {right}
    </div>
  );
}

export function WeekPoints({ p }: { p: PlayerCard }) {
  if (!p.week) return <span className="muted">—</span>;
  return (
    <span className="num" title={`floor ${p.week.floor} / ceiling ${p.week.ceiling}`}>
      <b>{p.week.points.toFixed(1)}</b>
      <span className="muted" style={{ fontSize: "0.75em" }}>
        {" "}
        {p.week.floor.toFixed(0)}–{p.week.ceiling.toFixed(0)}
      </span>
      {p.week.volatile && <span className="warn" title="sources disagree"> ⚡</span>}
    </span>
  );
}

export function NoLeague() {
  return (
    <div className="empty">
      No league selected — connect one on the <a href="/connections">Setup</a> page.
    </div>
  );
}

export function LoadingOrError({ loading, error }: { loading: boolean; error: string }) {
  if (loading) return <div className="spinner">Crunching…</div>;
  if (error) return <div className="empty bad">{error}</div>;
  return null;
}
