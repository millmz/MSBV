import { buildApp } from "./app.js";
import { ensureDataDir, getConfig } from "./config.js";
import { startSyncLoop } from "./sync/loop.js";
import { registerSpineJobs } from "./sync/spine.js";
import { registerEspnJobs } from "./connectors/espn/sync.js";
import { registerFantasyProsJobs } from "./connectors/fantasypros/sync.js";
import { registerYahooJobs } from "./connectors/yahoo/sync.js";

const config = getConfig();
ensureDataDir();

const app = await buildApp();

if (!config.appPassword) {
  app.log.warn("APP_PASSWORD is not set — the app is open to anyone who can reach it");
}

registerSpineJobs();
registerEspnJobs();
registerYahooJobs();
registerFantasyProsJobs();
startSyncLoop(app.log);

await app.listen({ port: config.port, host: "0.0.0.0" });
