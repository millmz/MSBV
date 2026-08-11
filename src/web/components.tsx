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

/**
 * Player headshot from the Sleeper CDN (canonical ids are Sleeper ids);
 * team logo for defenses; initials when no image resolves.
 */
export function PlayerAvatar({
  id,
  name,
  position,
  team,
  size = 30,
}: {
  id: string;
  name: string;
  position?: string;
  team?: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const isDst = position === "DST" || position === "DEF";
  const src = isDst
    ? `https://sleepercdn.com/images/team_logos/nfl/${(team ?? id).toLowerCase()}.png`
    : `https://sleepercdn.com/content/nfl/players/thumb/${id}.jpg`;
  if (failed) {
    const initials = name
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
    return (
      <span className="avatar avatar-fb" style={{ width: size, height: size, fontSize: size * 0.36 }}>
        {initials}
      </span>
    );
  }
  return (
    <img
      className="avatar"
      style={{ width: size, height: size }}
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
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
    <div className="player-line">
      <PlayerAvatar id={p.id} name={p.name} position={p.position} team={p.team} />
      <span className="player-line-name">
        <b>{p.name}</b>
        <span className="player-line-meta">
          <PosPill position={p.position} />
          <span className="muted">{p.team}</span>
          <Injury status={p.injuryStatus} />
        </span>
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
      {p.week.volatile && <span className="warn" title="projection sources disagree"> ±</span>}
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
