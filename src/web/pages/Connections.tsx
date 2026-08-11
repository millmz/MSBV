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
  const [oobPending, setOobPending] = useState(false);
  const [oobCode, setOobCode] = useState("");

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
      const res = await api.post<{ authorizeUrl: string; mode: "oob" | "callback" }>(
        "/api/yahoo/app",
        { clientId, clientSecret },
      );
      if (res.mode === "oob") {
        // Yahoo can't redirect back to a local http server, so it will show a
        // verification code on screen instead — open consent in a new tab.
        window.open(res.authorizeUrl, "_blank", "noopener");
        setOobPending(true);
        setBusy(false);
      } else {
        window.location.href = res.authorizeUrl; // off to Yahoo's consent page
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
      setBusy(false);
    }
  };

  const submitOobCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post<{ status: string }>("/api/yahoo/code", { code: oobCode });
      setOobPending(false);
      setOobCode("");
      onChange(); // config reload shows connected state or the league picker
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
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
      {open && !config.yahoo.connected && !oobPending && (
        <form onSubmit={startOAuth}>
          <p className="muted">
            One-time setup (~10 min): create a free app at{" "}
            <a href="https://developer.yahoo.com/apps/create/" target="_blank" rel="noreferrer">
              developer.yahoo.com/apps/create
            </a>
            . Choose <b>Confidential Client</b> and give it <b>Fantasy Sports — Read</b>{" "}
            permission.{" "}
            {window.location.protocol === "https:" ? (
              <>
                Set the redirect URI to <code>{window.location.origin}/api/yahoo/callback</code>.
              </>
            ) : (
              <>
                Yahoo's form requires an <b>https</b> redirect URI — enter your future hosted URL
                (e.g. <code>https://msbv.onrender.com/api/yahoo/callback</code>); it isn't used
                when connecting locally. After you approve, Yahoo shows a short code to paste back
                here instead.
              </>
            )}{" "}
            Then paste the credentials below.
          </p>
          <label>Client ID</label>
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} />
          <label>Client Secret</label>
          <input value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
          <p>
            <button className="primary" disabled={busy || !clientId || !clientSecret} type="submit">
              {busy ? "Opening Yahoo…" : "Connect Yahoo"}
            </button>
          </p>
        </form>
      )}
      {open && !config.yahoo.connected && oobPending && (
        <form onSubmit={submitOobCode}>
          <p className="muted">
            A Yahoo tab just opened — sign in, approve access, and Yahoo will display a short
            verification code. Paste it here. (No tab? Allow pop-ups and hit Connect again.)
          </p>
          <label>Verification code from Yahoo</label>
          <input
            value={oobCode}
            onChange={(e) => setOobCode(e.target.value)}
            placeholder="e.g. abc123"
            autoFocus
          />
          <p>
            <button className="primary" disabled={busy || !oobCode.trim()} type="submit">
              {busy ? "Connecting…" : "Finish Yahoo connection"}
            </button>{" "}
            <button className="ghost" type="button" onClick={() => setOobPending(false)}>
              Start over
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

type FpStatus = {
  apiConfigured: boolean;
  datasets: { kind: string; scoring: string; rows: number; ageMinutes: number }[];
};

const FP_KIND_LABELS: Record<string, string> = {
  rankings: "Draft rankings (ECR)",
  projections: "Season projections",
  ros: "Rest-of-season rankings",
  week_ranks: "Weekly rankings",
  week_projections: "Weekly projections",
};

function FantasyProsCard() {
  const [status, setStatus] = useState<FpStatus | null>(null);
  const [scoring, setScoring] = useState("ppr");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [apiKey, setApiKey] = useState("");

  const saveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.post("/api/fantasypros/key", { apiKey });
      await api.post("/api/sync");
      setApiKey("");
      setMessage("API key saved — first API sync ran; check the datasets below.");
      api.get<FpStatus>("/api/fantasypros/status").then(setStatus).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  const load = () => {
    api.get<FpStatus>("/api/fantasypros/status").then(setStatus).catch(() => {});
  };
  useEffect(load, []);

  const connected = (status?.datasets.length ?? 0) > 0;
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (status) setOpen(status.datasets.length === 0);
  }, [status]);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const csv = await file.text();
      const res = await api.post<{ kind: string; rows: number; matched: number }>(
        "/api/fantasypros/upload",
        { scoring, csv },
      );
      setMessage(`Loaded ${res.kind}: ${res.rows} players, ${res.matched} matched to the universe.`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>
        FantasyPros{" "}
        <span className={status?.apiConfigured ? "good" : connected ? "good" : "muted"}>
          {status?.apiConfigured ? "● API connected" : connected ? "● loaded" : "○ no data yet"}
        </span>{" "}
        <button className="ghost" style={{ float: "right" }} onClick={() => setOpen(!open)}>
          {open ? "Hide" : connected ? "Update" : "Add"}
        </button>
      </h2>
      {open && (
        <>
          <p className="muted">
            FantasyPros is the <b>heaviest-weighted layer</b> in the consensus blend and drives the
            ECR columns on the draft and rankings boards. With an API key, everything syncs from
            the official API automatically. Without one, MSBV falls back to pulling the public
            consensus pages, and CSV exports uploaded below override either source for a week
            (useful for custom scoring).
          </p>
          <form onSubmit={saveKey}>
            <label>{status?.apiConfigured ? "Replace API key" : "FantasyPros API key"}</label>
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={status?.apiConfigured ? "••••••••  (saved)" : "paste your key"}
            />
            <p>
              <button className="primary" type="submit" disabled={busy || !apiKey.trim()}>
                {busy ? "Saving + syncing…" : "Save key & sync now"}
              </button>
            </p>
          </form>
          <label>Scoring format of the export</label>
          <select value={scoring} onChange={(e) => setScoring(e.target.value)}>
            <option value="ppr">PPR</option>
            <option value="half">Half PPR</option>
            <option value="std">Standard</option>
          </select>
          <label>{busy ? "Uploading…" : "FantasyPros CSV export"}</label>
          <input type="file" accept=".csv,text/csv" onChange={upload} disabled={busy} />
          {message && <p className="good">{message}</p>}
          {error && <p className="bad">{error}</p>}
          {connected && (
            <table style={{ marginTop: 10 }}>
              <thead>
                <tr><th>Dataset</th><th>Scoring</th><th className="num">Players</th><th className="num">Uploaded</th></tr>
              </thead>
              <tbody>
                {status!.datasets.map((d) => (
                  <tr key={`${d.kind}-${d.scoring}`}>
                    <td>{FP_KIND_LABELS[d.kind] ?? d.kind}</td>
                    <td className="muted">{d.scoring.toUpperCase()}</td>
                    <td className="num">{d.rows}</td>
                    <td className="num muted">
                      {d.ageMinutes < 90 ? `${d.ageMinutes}m ago` : `${Math.round(d.ageMinutes / 60)}h ago`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

type SpineStatus = {
  season: number;
  week: number;
  players: number;
  freshnessMinutes: Record<string, number | null>;
};

function DataHealth() {
  const [status, setStatus] = useState<SpineStatus | null>(null);
  useEffect(() => {
    api.get<SpineStatus>("/api/spine/status").then(setStatus).catch(() => {});
  }, []);
  if (!status) return null;
  const age = (min: number | null) =>
    min === null ? <span className="bad">never</span> : min < 90 ? <span className="good">{min}m ago</span> : <span className="warn">{Math.round(min / 60)}h ago</span>;
  const labels: Record<string, string> = {
    players: "Player universe",
    seasonProjections: "Season projections",
    weekProjections: "Week projections",
    trending: "Trending adds/drops",
    usage: "Usage stats (nflverse)",
    tiers: "Tier charts",
    fantasypros: "FantasyPros (CSV uploads)",
  };
  return (
    <div className="card">
      <h2>Data health <span className="muted">· {status.players.toLocaleString()} players · week {status.week || "preseason"}</span></h2>
      <table>
        <tbody>
          {Object.entries(labels).map(([key, label]) => (
            <tr key={key}>
              <td>{label}</td>
              <td className="num">
                {key === "weekProjections" && status.week === 0 ? (
                  <span className="muted">in season</span>
                ) : key === "fantasypros" && status.freshnessMinutes[key] == null ? (
                  <span className="muted">optional</span>
                ) : (
                  age(status.freshnessMinutes[key] ?? null)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
      <FantasyProsCard />
      <DataHealth />
      <div className="card">
        <h2>Your weekly rhythm</h2>
        <p className="muted" style={{ margin: "4px 0" }}><b>Tuesday night</b> — Waivers tab before claims process: top targets + who to drop.</p>
        <p className="muted" style={{ margin: "4px 0" }}><b>Wednesday</b> — Edge tab: buy-low / sell-high trades while the week is young.</p>
        <p className="muted" style={{ margin: "4px 0" }}><b>Sunday morning</b> — Lineup tab for final start/sit with fresh injury statuses.</p>
      </div>
    </>
  );
}
