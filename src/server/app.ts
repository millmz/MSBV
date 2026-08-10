import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { authGuard, loginToken, SESSION_COOKIE, isAuthed } from "./auth.js";
import { getConfig } from "./config.js";
import { registerApiRoutes } from "./api/routes.js";

export async function buildApp() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

  await app.register(fastifyCookie);
  app.addHook("preHandler", authGuard);

  app.get("/api/health", async () => ({ ok: true }));

  app.post<{ Body: { password?: string } }>("/api/login", async (req, reply) => {
    const token = loginToken(req.body?.password ?? "");
    if (!token) return reply.code(401).send({ error: "wrong password" });
    reply.setCookie(SESSION_COOKIE, token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
    return { ok: true };
  });

  app.get("/api/session", async (req) => ({
    authed: isAuthed(req),
    passwordRequired: Boolean(getConfig().appPassword),
  }));

  await registerApiRoutes(app);

  // Serve the built SPA when it exists (production); in dev, vite serves the UI.
  const webDist = join(process.cwd(), "dist", "web");
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) return reply.code(404).send({ error: "not found" });
      return reply.sendFile("index.html");
    });
  }

  return app;
}
