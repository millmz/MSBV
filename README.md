# Lemon League — Fantasy Football Season Companion

A WalterPicks-style platform for one owner, two leagues: syncs your **ESPN** and **Yahoo** fantasy football teams and gives you draft tools, weekly start/sit calls, waiver-wire targets, add/drop advice, and trade evaluation — all scored to each league's exact settings.

## The edge thesis

Syncing leagues and sorting by projection is table stakes. MSBV is built around five edges, all on free data:

1. **Consensus blend** — Sleeper + ESPN + Yahoo projections + Boris Chen tiers merged into one blended projection per player, per league's exact scoring. Blends beat any single source; cross-source disagreement is surfaced as a volatility flag.
2. **Mispricing detector** — your leaguemates act on the platform's default rankings. MSBV computes *blend rank vs. platform rank* per league: platform-underrated players are your waiver claims and buy-low trade targets before anyone else sees it; platform-overrated players are your sell-highs.
3. **Usage-based regression** — nflverse play-by-play → snap/target/red-zone shares → expected fantasy points vs. actual. Flags unsustainable TD rates (sell high) and elite-usage-bad-luck players (buy low / claim now). Leading indicator vs. everyone else's box-score rearview mirror.
4. **Game-state-aware start/sit** — floor/median/ceiling per player; if you're favored, prefer floor, if you're the underdog, chase ceiling. Recommendations maximize win probability, not mean points.
5. **Proactive trade finder** — every roster in both leagues is synced, so MSBV scans for complementary surplus/need pairs and proposes specific packages with a "why they'd accept" rationale.

Honest limit: no paid in-house projections. The edge is blending, league context, and usage analytics — which is most of what matters when opponents run platform defaults.

## Running it

```bash
pnpm install
pnpm test        # engine + server tests
pnpm dev         # API on :8788, UI on :5173 (proxied)
pnpm build       # build the SPA → dist/web
pnpm start       # serve API + built SPA on :8788 (production mode)
```

## Configuration

Everything can be entered on the in-app **Setup** screen; environment variables override the settings file and are what you want on Render (they survive redeploys).

| Env var | What |
|---|---|
| `APP_PASSWORD` | Password gate for the hosted app. **Set this before deploying.** |
| `BASE_URL` | Public URL of the app (needed for Yahoo OAuth callback), e.g. `https://msbv.onrender.com` |
| `SEASON` | Override the NFL season year (defaults to the current season) |
| `ESPN_LEAGUE_ID`, `ESPN_S2`, `ESPN_SWID` | ESPN league + private-league cookies |
| `YAHOO_CLIENT_ID`, `YAHOO_CLIENT_SECRET`, `YAHOO_REFRESH_TOKEN`, `YAHOO_LEAGUE_KEY` | Yahoo OAuth app + tokens |
| `MSBV_DATA_DIR` | Where the JSON cache lives (default `./data`) |

### Connecting ESPN (~2 minutes)

1. Log in to fantasy.espn.com in your browser and open your league.
2. The league ID is in the URL: `leagueId=XXXXX`.
3. If the league is private: open DevTools → Application → Cookies → `espn.com`, copy `espn_s2` and `SWID` (including the curly braces).
4. Paste all three on the Setup screen (or set the env vars).

### Connecting Yahoo (~10 minutes, one time)

1. Go to [developer.yahoo.com/apps/create](https://developer.yahoo.com/apps/create/).
2. Create an app: any name, **Confidential Client**, API permission = **Fantasy Sports (Read)**.
   Yahoo's form insists on an **https** redirect URI — enter your hosted URL
   (`https://<your-app>.onrender.com/api/yahoo/callback`). Running locally? Enter it anyway;
   local connects don't use it.
3. Paste the Client ID and Client Secret on the Setup screen and click **Connect Yahoo**.
   - **Hosted (https)**: you bounce through Yahoo's consent page and land back connected.
   - **Local (http)**: a Yahoo tab opens and shows a short verification code after you
     approve — paste it back into the Setup screen.
4. The Setup screen then shows the refresh token to copy into `YAHOO_REFRESH_TOKEN` on Render so the connection survives redeploys.

## Deploying to Render

The repo ships a `render.yaml`. Create a new **Web Service** from this repo on [render.com](https://render.com), and set the env vars above (at minimum `APP_PASSWORD` and `BASE_URL`). Free tier works: all data re-syncs from the league APIs on boot, and credentials live in env vars, so the ephemeral disk costs nothing but a warm-up sync.

## How to use it through the season

- **Draft day**: open the Draft tab, hit **Go live** when your draft starts. Picks sync every few seconds; the advice panel reranks for your roster, warns about tier cliffs, and counts picks until your turn. The cheat sheet below it never breaks, even if live sync does.
- **Tuesday night** (before waivers process): Waivers tab — top claims with reasons and who to drop.
- **Wednesday**: Edge tab — buy-low/sell-high windows and platform mispricings for trade offers; Trades tab proposes specific packages.
- **Sunday morning**: Lineup tab — final start/sit with floor/ceiling logic tuned to whether you're favored or chasing.

## Data sources (all free)

- **Sleeper API** — player universe + ESPN/Yahoo ID cross-map, projections, ADP, trending adds/drops, injury status
- **ESPN / Yahoo league APIs** — league settings, rosters, matchups, free agents, their native projections
- **nflverse** — play-by-play-derived usage stats (snap/target/red-zone shares)
- **Boris Chen** — expert-consensus tier charts

## Architecture

Single TypeScript app: Fastify API + React SPA served from one process. JSON snapshot store (no database — every dataset is a re-syncable cache of an upstream API). Recommendation engine is pure functions, heavily unit-tested against fixture leagues. See `src/server/engine/`.

## Future work

FantasyPros/paid data blending, push/email alerts, auction draft values, dynasty/keeper valuations, LLM "ask the GM" chat.
