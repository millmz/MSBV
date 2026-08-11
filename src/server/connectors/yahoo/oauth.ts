import { getConfig, writeSettingsFile } from "../../config.js";
import { HttpError } from "../../http.js";

/**
 * Yahoo OAuth2 (authorization-code flow with refresh tokens). The user
 * creates a free "confidential client" app once; we keep the refresh token
 * in settings/env and mint short-lived access tokens on demand.
 */

const AUTH_URL = "https://api.login.yahoo.com/oauth2/request_auth";
const TOKEN_URL = "https://api.login.yahoo.com/oauth2/get_token";

/**
 * Yahoo's console only registers https redirect URIs, so a local http server
 * can never receive the callback. Out-of-band mode ("oob") sidesteps that:
 * Yahoo shows the user a verification code on screen to paste back into MSBV.
 */
export function useOob(): boolean {
  return !getConfig().baseUrl.startsWith("https://");
}

export function redirectUri(): string {
  return useOob() ? "oob" : `${getConfig().baseUrl}/api/yahoo/callback`;
}

export function authorizeUrl(state: string): string {
  const { clientId } = getConfig().yahoo;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const { clientId, clientSecret } = getConfig().yahoo;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new HttpError(res.status, TOKEN_URL, `Yahoo token request failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as TokenResponse;
}

let cached: { accessToken: string; expiresAt: number } | undefined;

/** Exchange the one-time authorization code; persists the refresh token. */
export async function exchangeCode(code: string): Promise<void> {
  const token = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
  });
  writeSettingsFile({ yahoo: { refreshToken: token.refresh_token } });
  cached = { accessToken: token.access_token, expiresAt: Date.now() + (token.expires_in - 60) * 1000 };
}

/** Current access token, refreshing when stale. Throws if not connected. */
export async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now()) return cached.accessToken;
  const { refreshToken } = getConfig().yahoo;
  if (!refreshToken) throw new Error("Yahoo is not connected");
  const token = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  // Yahoo may rotate the refresh token — persist whatever came back.
  if (token.refresh_token && token.refresh_token !== refreshToken) {
    writeSettingsFile({ yahoo: { refreshToken: token.refresh_token } });
  }
  cached = { accessToken: token.access_token, expiresAt: Date.now() + (token.expires_in - 60) * 1000 };
  return cached.accessToken;
}

export function clearTokenCache() {
  cached = undefined;
}
