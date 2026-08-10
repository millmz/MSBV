import React from "react";
import { useLeagues } from "../App.js";

export function Dashboard() {
  const { leagues } = useLeagues();
  if (leagues.length === 0) {
    return (
      <div className="card">
        <h2>Welcome to MSBV 🏈</h2>
        <p className="muted">
          No leagues connected yet. Head to <a href="/connections">Setup</a> to link your ESPN and
          Yahoo leagues — takes a few minutes and then everything here lights up.
        </p>
      </div>
    );
  }
  return <div className="empty">Dashboard coming online in M5 — leagues are connected.</div>;
}
