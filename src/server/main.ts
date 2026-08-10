import { buildApp } from "./app.js";
import { ensureDataDir, getConfig } from "./config.js";
import { startSyncLoop } from "./sync/loop.js";
import { registerSpineJobs } from "./sync/spine.js";

const config = getConfig();
ensureDataDir();

const app = await buildApp();

if (!config.appPassword) {
  app.log.warn("APP_PASSWORD is not set — the app is open to anyone who can reach it");
}

registerSpineJobs();
startSyncLoop(app.log);

await app.listen({ port: config.port, host: "0.0.0.0" });
