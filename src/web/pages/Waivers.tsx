import React from "react";
import {
  LoadingOrError,
  NoLeague,
  PlayerLine,
  WeekPoints,
  useLeagueData,
  type PlayerCard,
} from "../components.js";

type WaiverData = {
  targets: (PlayerCard & {
    score: number;
    reasons: string[];
    trendingAdds?: number;
    upgradeOver?: { playerId: string; delta: number; name?: string };
    suggestedDrop?: { id: string; name?: string };
  })[];
  drops: (PlayerCard & { reason: string })[];
  streams: (PlayerCard & { position: string })[];
};

export function Waivers() {
  const { data, error, loading, leagueSelected } = useLeagueData<WaiverData>("/waivers");
  if (!leagueSelected) return <NoLeague />;
  if (loading || error) return <LoadingOrError loading={loading} error={error} />;
  if (!data) return null;

  return (
    <>
      <div className="card">
        <h2>Waiver targets</h2>
        {data.targets.length === 0 && (
          <p className="muted">Nothing on the wire beats your roster right now. Good sign.</p>
        )}
        {data.targets.map((t, i) => (
          <div key={t.id} style={{ borderBottom: "1px solid var(--line)", padding: "8px 0" }}>
            <PlayerLine
              p={t}
              right={
                <span>
                  {t.trendingAdds && <span className="pill up">🔥 {t.trendingAdds.toLocaleString()}</span>}{" "}
                  <WeekPoints p={t} />
                </span>
              }
            />
            <ul className="muted" style={{ margin: "4px 0 4px 8px", paddingLeft: 12, fontSize: "0.85rem" }}>
              {t.reasons.map((r, j) => (
                <li key={j}>{r}</li>
              ))}
            </ul>
            {t.suggestedDrop?.name && (
              <p className="muted" style={{ margin: "2px 0" }}>
                ↳ drop <b>{t.suggestedDrop.name}</b>
              </p>
            )}
            {i === 0 && <p className="good" style={{ margin: "2px 0" }}>Top claim this week</p>}
          </div>
        ))}
      </div>

      {data.streams.length > 0 && (
        <div className="card">
          <h2>Streams of the week</h2>
          {data.streams.map((s) => (
            <PlayerLine key={s.id} p={s} right={<WeekPoints p={s} />} />
          ))}
        </div>
      )}

      <div className="card">
        <h2>Droppable</h2>
        {data.drops.map((d) => (
          <div key={d.id}>
            <PlayerLine p={d} right={<span className="muted">{d.vor?.toFixed(0)} VOR</span>} />
            <p className="muted" style={{ margin: "0 0 6px 30px", fontSize: "0.8rem" }}>{d.reason}</p>
          </div>
        ))}
      </div>
    </>
  );
}
