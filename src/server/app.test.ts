import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

describe("auth gate", () => {
  beforeEach(() => {
    process.env.APP_PASSWORD = "hut-hut-hike";
  });
  afterEach(() => {
    delete process.env.APP_PASSWORD;
  });

  it("blocks API routes without a session", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/config" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a wrong password", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { password: "nope" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("logs in with the right password and grants access", async () => {
    const app = await buildApp();
    const login = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { password: "hut-hut-hike" },
    });
    expect(login.statusCode).toBe(200);
    const cookie = login.cookies.find((c) => c.name === "msbv_session");
    expect(cookie).toBeDefined();
    const res = await app.inject({
      method: "GET",
      url: "/api/config",
      cookies: { msbv_session: cookie!.value },
    });
    expect(res.statusCode).toBe(200);
  });

  it("leaves health open", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
  });

  it("is open when no password is configured", async () => {
    delete process.env.APP_PASSWORD;
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/config" });
    expect(res.statusCode).toBe(200);
  });
});
