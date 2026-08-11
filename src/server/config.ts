import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

/**
 * Configuration comes from two layers:
 *  1. Environment variables (durable on Render, survive redeploys) — always win.
 *  2. data/settings.json — written by the in-app Connections screens, convenient
 *     but ephemeral on Render's free tier. The UI tells the user which env var
 *     to set to make each credential permanent.
 */

export const DATA_DIR = process.env.MSBV_DATA_DIR ?? join(process.cwd(), "data");

const SettingsSchema = z
  .object({
    espn: z
      .object({
        leagueId: z.string().optional(),
        s2: z.string().optional(),
        swid: z.string().optional(),
        teamId: z.number().optional(),
      })
      .optional(),
    yahoo: z
      .object({
        clientId: z.string().optional(),
        clientSecret: z.string().optional(),
        refreshToken: z.string().optional(),
        leagueKey: z.string().optional(),
        teamKey: z.string().optional(),
      })
      .optional(),
    fantasypros: z
      .object({
        apiKey: z.string().optional(),
      })
      .optional(),
    season: z.number().optional(),
  })
  .default({});

export type Settings = z.infer<typeof SettingsSchema>;

const settingsPath = () => join(DATA_DIR, "settings.json");

export function readSettingsFile(): Settings {
  try {
    return SettingsSchema.parse(JSON.parse(readFileSync(settingsPath(), "utf8")));
  } catch {
    return SettingsSchema.parse({});
  }
}

export function writeSettingsFile(patch: Partial<Settings>): Settings {
  const current = readSettingsFile();
  const next: Settings = {
    ...current,
    ...patch,
    espn: { ...current.espn, ...patch.espn },
    yahoo: { ...current.yahoo, ...patch.yahoo },
    fantasypros: { ...current.fantasypros, ...patch.fantasypros },
  };
  mkdirSync(dirname(settingsPath()), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(next, null, 2));
  return next;
}

/** Resolved config: env vars layered over the settings file. */
export function getConfig() {
  const file = readSettingsFile();
  const env = process.env;
  return {
    port: Number(env.PORT ?? 8788),
    /** Public base URL (needed for the Yahoo OAuth redirect). */
    baseUrl: env.BASE_URL ?? `http://localhost:${Number(env.PORT ?? 8788)}`,
    appPassword: env.APP_PASSWORD ?? "",
    season: Number(env.SEASON ?? file.season ?? currentSeason()),
    espn: {
      leagueId: env.ESPN_LEAGUE_ID ?? file.espn?.leagueId ?? "",
      s2: env.ESPN_S2 ?? file.espn?.s2 ?? "",
      swid: env.ESPN_SWID ?? file.espn?.swid ?? "",
      teamId: file.espn?.teamId,
    },
    yahoo: {
      clientId: env.YAHOO_CLIENT_ID ?? file.yahoo?.clientId ?? "",
      clientSecret: env.YAHOO_CLIENT_SECRET ?? file.yahoo?.clientSecret ?? "",
      refreshToken: env.YAHOO_REFRESH_TOKEN ?? file.yahoo?.refreshToken ?? "",
      leagueKey: env.YAHOO_LEAGUE_KEY ?? file.yahoo?.leagueKey ?? "",
      teamKey: file.yahoo?.teamKey,
    },
    fantasypros: {
      apiKey: env.FANTASYPROS_API_KEY ?? file.fantasypros?.apiKey ?? "",
    },
  };
}

/** NFL season year: a season spans Sep–Feb, so Jan/Feb belong to the prior year's season. */
export function currentSeason(now = new Date()): number {
  const y = now.getUTCFullYear();
  return now.getUTCMonth() + 1 <= 2 ? y - 1 : y;
}

export function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}
