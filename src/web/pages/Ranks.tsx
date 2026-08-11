import React, { useState } from "react";
import {
  LoadingOrError,
  NoLeague,
  PosPill,
  useLeagueData,
  WeekPoints,
  type PlayerCard,
} from "../components.js";

type RankRow = PlayerCard & {
  rosRank?: number;
  rosTier?: number;
  weekPosRank?: number;
  rosteredBy?: string;
};

type RanksResponse = {
  view: "week" | "ros";
  week: number;
  hasFpRos?: boolean;
  hasFpWeek?: boolean;
  rows: RankRow[];
};

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "K", "DST"];

export function Ranks() {
  const [view, setView] = useState<"week" | "ros">("ros");
  const [pos, setPos] = useState("ALL");
  const { data, error, loading, leagueSelected } = useLeagueData<RanksResponse>(
    `/ranks?view=${view}`,
  );

  if (!leagueSelected) return <NoLeague />;

  const rows = (data?.rows ?? []).filter(
    (r) => pos === "ALL" || r.position === pos || (pos === "DST" && r.position === "DEF"),
  );

  return (
    <div className="card">
      <h2>
        Rankings{" "}
        <span className="muted">
          {view === "ros" ? "· rest of season" : data?.week ? `· week ${data.week}` : ""}
        </span>
      </h2>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div className="league-toggle" style={{ margin: 0 }}>
          <button className={view === "ros" ? "active" : ""} onClick={() => setView("ros")}>
            Rest of season
          </button>
          <button className={view === "week" ? "active" : ""} onClick={() => setView("week")}>
            This week
          </button>
        </div>
        <div className="league-toggle" style={{ margin: 0 }}>
          {POSITIONS.map((p) => (
            <button key={p} className={pos === p ? "active" : ""} onClick={() => setPos(p)}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {(loading || error) && <LoadingOrError loading={loading} error={error} />}

      {data && view === "week" && data.week === 0 && (
        <div className="empty">
          Weekly rankings start in week 1 — it's still preseason. The rest-of-season board is live
          now.
        </div>
      )}

      {data && rows.length > 0 && (
        <>
          {view === "ros" && !data.hasFpRos && (
            <p className="muted" style={{ fontSize: "0.8rem" }}>
              Showing the blend's season board — FantasyPros ROS ranks join automatically after the
              next successful sync.
            </p>
          )}
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  {view === "ros" ? (
                    <>
                      <th className="num">ROS ECR</th>
                      <th className="num">Tier</th>
                      <th className="num">Season pts</th>
                    </>
                  ) : (
                    <>
                      <th className="num">Proj</th>
                      <th className="num">Pos ECR</th>
                    </>
                  )}
                  <th>Rostered</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((r, i) => (
                  <tr key={r.id}>
                    <td className="muted">{i + 1}</td>
                    <td>
                      <PosPill position={r.position} /> <b>{r.name}</b>{" "}
                      <span className="muted">{r.team}</span>
                      {r.injuryStatus && (
                        <span className="warn">
                          {" "}
                          {r.injuryStatus === "Questionable" ? "Q" : r.injuryStatus}
                        </span>
                      )}
                    </td>
                    {view === "ros" ? (
                      <>
                        <td className="num">{r.rosRank ?? "—"}</td>
                        <td className="num muted">{r.rosTier !== undefined ? `T${r.rosTier}` : "—"}</td>
                        <td className="num">{r.season ? r.season.points.toFixed(0) : "—"}</td>
                      </>
                    ) : (
                      <>
                        <td>
                          <WeekPoints p={r} />
                        </td>
                        <td className="num muted">{r.weekPosRank ?? "—"}</td>
                      </>
                    )}
                    <td className="muted" style={{ fontSize: "0.78rem" }}>
                      {r.rosteredBy ?? <span className="good">free agent</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
