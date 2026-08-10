import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getConfig } from "./config.js";

/**
 * Single shared-password gate. When APP_PASSWORD is set, every /api route
 * (except login/health and the Yahoo OAuth callback) requires the session
 * cookie, which is an HMAC of a fixed message keyed by the password — so
 * changing the password invalidates all sessions and nothing secret is
 * stored server-side.
 */

export const SESSION_COOKIE = "msbv_session";

function expectedToken(password: string): string {
  return createHmac("sha256", `msbv:${password}`).update("session-v1").digest("hex");
}

export function loginToken(password: string): string | undefined {
  const { appPassword } = getConfig();
  if (!appPassword) return expectedToken(""); // auth disabled → any login succeeds
  const a = Buffer.from(password);
  const b = Buffer.from(appPassword);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined;
  return expectedToken(appPassword);
}

export function isAuthed(req: FastifyRequest): boolean {
  const { appPassword } = getConfig();
  if (!appPassword) return true; // no password configured → open (local dev)
  const cookie = req.cookies?.[SESSION_COOKIE];
  if (!cookie) return false;
  const expected = Buffer.from(expectedToken(appPassword));
  const got = Buffer.from(cookie);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

const OPEN_PATHS = new Set(["/api/login", "/api/health", "/api/yahoo/callback"]);

export async function authGuard(req: FastifyRequest, reply: FastifyReply) {
  if (!req.url.startsWith("/api/")) return;
  const path = req.url.split("?")[0] ?? "";
  if (OPEN_PATHS.has(path)) return;
  if (!isAuthed(req)) {
    reply.code(401).send({ error: "unauthorized" });
  }
}
