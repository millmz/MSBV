import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { useLeagues } from "../App.js";

type ConfigInfo = {
  season: number;
  espn: { leagueId: string; connected: boolean };
  yahoo: { appConfigured: boolean; connected: boolean; leagueKey: string };
};

type EspnConnectResult = {
  ok: boolean;
  league: {
    id: string;
    name: string;
    scoringLabel: string;
    teams: { id: string; name: string }[];
    myTeamId?: string;
  };
};

function EspnCard({ config, onChange }: { config: ConfigInfo; onChange: () => void }) {
  const [open, setOpen] = useState(!config.espn.connected);
  const [leagueId, setLeagueId] = useState(config.espn.leagueId);
  const [s2, setS2] = useState("");
  const [swid, setSwid] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<EspnConnectResult["league"] | null>(null);

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api.post<EspnConnectResult>("/api/espn/connect", { leagueId, s2, swid });
      setResult(res.league);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "connection failed");
    } finally {
      setBusy(false);
    }
  };

  const pickTeam = async (teamId: string) => {
    await api.post("/api/espn/my-team", { teamId: Number(teamId) });
    setResult((r) => (r ? { ...r, myTeamId: teamId } : r));
    onChange();
  };

  return (
    <div className="card">
      <h2>
        ESPN league{" "}
        <span className={config.espn.connected ? "good" : "muted"}>
          {config.espn.connected ? "● connected" : "○ not connected"}
        </span>{" "}
        <button className="ghost" style={{ float: "right" }} onClick={() => setOpen(!open)}>
          {open ? "Hide" : config.espn.connected ? "Edit" : "Connect"}
        </button>
      </h2>
      {open && (
        <form onSubmit={connect}>
          <p className="muted">
            Find the league ID in your league's URL on fantasy.espn.com (<code>leagueId=…</code>).
            If the league is <b>private</b>, also paste two cookies: on fantasy.espn.com open
            DevTools → Application → Cookies → espn.com and copy <code>espn_s2</code> and{" "}
            <code>SWID</code> (keep the curly braces).
          </p>
          <label>League ID</label>
          <input value={leagueId} onChange={(e) => setLeagueId(e.target.value)} placeholder="e.g. 1234567" />
          <label>espn_s2 cookie (private leagues)</label>
          <input value={s2} onChange={(e) => setS2(e.target.value)} placeholder="AEB…" />
          <label>SWID cookie (private leagues)</label>
          <input value={swid} onChange={(e) => setSwid(e.target.value)} placeholder="{XXXXXXXX-…}" />
          {error && <p className="bad">{error}</p>}
          <p>
            <button className="primary" disabled={busy || !leagueId.trim()} type="submit">
              {busy ? "Connecting…" : "Connect ESPN"}
            </button>
          </p>
        </form>
      )}
      {result && (
        <div>
          <p className="good">
            Connected: <b>{result.name}</b> ({result.scoringLabel})
          </p>
          <label>Which team is yours?</label>
          <select value={result.myTeamId ?? ""} onChange={(e) => pickTeam(e.target.value)}>
            <option value="" disabled>
              Pick your team…
            </option>
            {result.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <p className="muted" style={{ marginTop: 10 }}>
            Deploying on Render? Copy these into the service's environment so the connection
            survives redeploys: <code>ESPN_LEAGUE_ID</code>, <code>ESPN_S2</code>,{" "}
            <code>ESPN_SWID</code>.
          </p>
        </div>
      )}
    </div>
  );
}

function YahooCard({ config, onChange }: { config: ConfigInfo; onChange: () => void }) {
  const params = new URLSearchParams(window.location.search);
  const needsPick = params.get("yahoo") === "pick_league" || (config.yahoo.connected && !config.yahoo.leagueKey);
  const yahooError = params.get("yahoo_error");

  const [open, setOpen] = useState(!config.yahoo.connected);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(yahooError ? `Yahoo error: ${yahooError}` : "");
  const [leagues, setLeagues] = useState<{ leagueKey: string; name: string }[] | null>(null);
  const [env, setEnv] = useState<Record<string, string | null> | null>(null);

  useEffect(() => {
    if (needsPick) {
      api.get<{ leagues: { leagueKey: string; name: string }[] }>("/api/yahoo/leagues")
        .then((r) => setLeagues(r.leagues))
        .catch(() => {});
    }
    if (config.yahoo.connected) {
      api.get<Record<string, string | null>>("/api/yahoo/env").then(setEnv).catch(() => {});
    }
  }, [needsPick, config.yahoo.connected]);

  const startOAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api.post<{ authorizeUrl: string }>("/api/yahoo/app", { clientId, clientSecret });
      window.location.href = res.authorizeUrl; // off to Yahoo's consent page
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
      setBusy(false);
    }
  };

  const pickLeague = async (leagueKey: string) => {
    setBusy(true);
    try {
      await api.post("/api/yahoo/league", { leagueKey });
      window.history.replaceState(null, "", "/connections");
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>
        Yahoo league{" "}
        <span className={config.yahoo.connected ? "good" : "muted"}>
          {config.yahoo.connected ? "● connected" : "○ not connected"}
        </span>{" "}
        <button className="ghost" style={{ float: "right" }} onClick={() => setOpen(!open)}>
          {open ? "Hide" : config.yahoo.connected ? "Details" : "Connect"}
        </button>
      </h2>
      {error && <p className="bad">{error}</p>}
      {needsPick && leagues && (
        <div>
          <label>Pick your Yahoo league</label>
          {leagues.map((l) => (
            <p key={l.leagueKey}>
              <button className="primary" disabled={busy} onClick={() => pickLeague(l.leagueKey)}>
                {l.name}
              </button>
            </p>
          ))}
        </div>
      )}
      {open && !config.yahoo.connected && (
        <form onSubmit={startOAuth}>
          <p className="muted">
            One-time setup (~10 min): create a free app at{" "}
            <a href="https://developer.yahoo.com/apps/create/" target="_blank" rel="noreferrer">
              developer.yahoo.com/apps/create
            </a>
            . Choose <b>Confidential Client</b>, set the redirect URI to{" "}
            <code>{window.location.origin}/api/yahoo/callback</code>, and give it{" "}
            <b>Fantasy Sports — Read</b> permission. Then paste the credentials here.
          </p>
          <label>Client ID</label>
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} />
          <label>Client Secret</label>
          <input value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
          <p>
            <button className="primary" disabled={busy || !clientId || !clientSecret} type="submit">
              {busy ? "Redirecting…" : "Connect Yahoo"}
            </button>
          </p>
        </form>
      )}
      {open && config.yahoo.connected && env && (
        <div>
          <p className="muted">
            Deploying on Render? Set these env vars so the connection survives redeploys:
          </p>
          <pre style={{ overflowX: "auto", fontSize: "0.75rem" }}>
            {`YAHOO_CLIENT_ID=${env.YAHOO_CLIENT_ID ?? ""}
YAHOO_REFRESH_TOKEN=${env.YAHOO_REFRESH_TOKEN ?? ""}
YAHOO_LEAGUE_KEY=${env.YAHOO_LEAGUE_KEY ?? ""}`}
          </pre>
          <p className="muted">(Client secret: use the value from developer.yahoo.com.)</p>
        </div>
      )}
    </div>
  );
}

export function Connections() {
  const [config, setConfig] = useState<ConfigInfo | null>(null);
  const { refresh } = useLeagues();

  const load = () => {
    api.get<ConfigInfo>("/api/config").then(setConfig).catch(() => {});
  };
  useEffect(load, []);

  const [syncing, setSyncing] = useState(false);
  const syncNow = async () => {
    setSyncing(true);
    try {
      await api.post("/api/sync");
      refresh();
    } finally {
      setSyncing(false);
    }
  };

  if (!config) return <div className="spinner">Loading…</div>;

  return (
    <>
      <div className="card">
        <h2>Season {config.season}</h2>
        <p className="muted">
          Connect both leagues below. Player data (projections, usage, tiers) syncs automatically
          in the background.
        </p>
        <button className="ghost" onClick={syncNow} disabled={syncing}>
          {syncing ? "Syncing…" : "Re-sync everything now"}
        </button>
      </div>
      <EspnCard
        config={config}
        onChange={() => {
          load();
          refresh();
        }}
      />
      <YahooCard
        config={config}
        onChange={() => {
          load();
          refresh();
        }}
      />
    </>
  );
}
