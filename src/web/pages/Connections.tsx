import React, { useEffect, useState } from "react";
import { api } from "../api.js";

type ConfigInfo = {
  season: number;
  espn: { leagueId: string; connected: boolean };
  yahoo: { appConfigured: boolean; connected: boolean; leagueKey: string };
};

export function Connections() {
  const [config, setConfig] = useState<ConfigInfo | null>(null);

  useEffect(() => {
    api.get<ConfigInfo>("/api/config").then(setConfig).catch(() => {});
  }, []);

  if (!config) return <div className="spinner">Loading…</div>;

  return (
    <>
      <div className="card">
        <h2>Season {config.season}</h2>
        <p className="muted">Connect both leagues below. Full guided flows arrive with M2/M3.</p>
      </div>
      <div className="card">
        <h2>
          ESPN league{" "}
          <span className={config.espn.connected ? "good" : "muted"}>
            {config.espn.connected ? "● connected" : "○ not connected"}
          </span>
        </h2>
      </div>
      <div className="card">
        <h2>
          Yahoo league{" "}
          <span className={config.yahoo.connected ? "good" : "muted"}>
            {config.yahoo.connected ? "● connected" : "○ not connected"}
          </span>
        </h2>
      </div>
    </>
  );
}
