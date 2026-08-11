import React, { createContext, useContext, useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { api } from "./api.js";
import { Dashboard } from "./pages/Dashboard.js";
import { Lineup } from "./pages/Lineup.js";
import { Waivers } from "./pages/Waivers.js";
import { Trades } from "./pages/Trades.js";
import { Draft } from "./pages/Draft.js";
import { EdgeReport } from "./pages/EdgeReport.js";
import { Ranks } from "./pages/Ranks.js";
import { Connections } from "./pages/Connections.js";
import {
  IconDraft,
  IconEdge,
  IconHome,
  IconLineup,
  IconRanks,
  IconSetup,
  IconTrades,
  IconWaivers,
  LemonMark,
} from "./icons.js";

export type LeagueSummary = {
  id: string;
  platform: "espn" | "yahoo";
  name: string;
  myTeamName?: string;
};

type LeagueCtx = {
  leagues: LeagueSummary[];
  selected: string | null;
  select: (id: string) => void;
  refresh: () => void;
};

const LeagueContext = createContext<LeagueCtx>({
  leagues: [],
  selected: null,
  select: () => {},
  refresh: () => {},
});

export const useLeagues = () => useContext(LeagueContext);

function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/api/login", { password });
      onSuccess();
    } catch {
      setError("Wrong password");
    }
  };
  return (
    <div className="login-wrap">
      <form className="login-box" onSubmit={submit}>
        <div className="login-mark">
          <LemonMark size={72} />
        </div>
        <h1>Lemon League</h1>
        <p className="tagline">Medium Stakes · Big Vibes</p>
        <p className="stakes">Winner takes the bragging rights. Loser eats the lemon.</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
        />
        {error && <p className="bad">{error}</p>}
        <p>
          <button className="primary" type="submit">
            Let me in
          </button>
        </p>
      </form>
    </div>
  );
}

const TABS = [
  { to: "/", icon: IconHome, label: "Home" },
  { to: "/lineup", icon: IconLineup, label: "Lineup" },
  { to: "/waivers", icon: IconWaivers, label: "Waivers" },
  { to: "/trades", icon: IconTrades, label: "Trades" },
  { to: "/draft", icon: IconDraft, label: "Draft" },
  { to: "/ranks", icon: IconRanks, label: "Ranks" },
  { to: "/edge", icon: IconEdge, label: "Edge" },
  { to: "/connections", icon: IconSetup, label: "Setup" },
];

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [leagues, setLeagues] = useState<LeagueSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const loadSession = async () => {
    try {
      const s = await api.get<{ authed: boolean }>("/api/session");
      setAuthed(s.authed);
    } catch {
      setAuthed(false);
    }
  };

  const loadLeagues = async () => {
    try {
      const data = await api.get<{ leagues: LeagueSummary[] }>("/api/leagues");
      setLeagues(data.leagues);
      setSelected((cur) => cur ?? data.leagues[0]?.id ?? null);
    } catch {
      // not connected yet — fine
    }
  };

  useEffect(() => {
    void loadSession();
  }, []);
  useEffect(() => {
    if (authed) void loadLeagues();
  }, [authed]);

  if (authed === null) return <div className="spinner">Loading…</div>;
  if (!authed) return <Login onSuccess={() => setAuthed(true)} />;

  return (
    <LeagueContext.Provider
      value={{ leagues, selected, select: setSelected, refresh: () => void loadLeagues() }}
    >
      <div className="app">
        <header className="topbar">
          <div className="lockup">
            <LemonMark size={30} />
            <div>
              <div className="brand">Lemon League</div>
              <div className="topbar-tag">Medium Stakes · Big Vibes</div>
            </div>
          </div>
          <div className="league-toggle">
            {leagues.map((l) => (
              <button
                key={l.id}
                className={selected === l.id ? "active" : ""}
                onClick={() => setSelected(l.id)}
              >
                {l.platform === "espn" ? "ESPN" : "Yahoo"}
              </button>
            ))}
          </div>
        </header>
        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/lineup" element={<Lineup />} />
            <Route path="/waivers" element={<Waivers />} />
            <Route path="/trades" element={<Trades />} />
            <Route path="/draft" element={<Draft />} />
            <Route path="/ranks" element={<Ranks />} />
            <Route path="/edge" element={<EdgeReport />} />
            <Route path="/connections" element={<Connections />} />
          </Routes>
        </main>
        <nav className="tabbar">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
              <span className="icon">
                <t.icon size={19} />
              </span>
              {t.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </LeagueContext.Provider>
  );
}
