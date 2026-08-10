import type { FastifyBaseLogger } from "fastify";
import { runAllJobsNow } from "./loop.js";
import { registerSpineJobs } from "./spine.js";
import { registerEspnJobs } from "../connectors/espn/sync.js";
import { registerFantasyProsJobs } from "../connectors/fantasypros/sync.js";
import { registerYahooJobs } from "../connectors/yahoo/sync.js";

/**
 * One-shot CLI sync (`pnpm sync`) — registers the same jobs as the server
 * and force-runs them once. Useful for cron warm-ups and connector debugging.
 */

const consoleLogger: FastifyBaseLogger = {
  level: "info",
  silent: () => {},
  fatal: (...args: unknown[]) => console.error(...args),
  error: (...args: unknown[]) => console.error(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  info: (...args: unknown[]) => console.log(...args),
  debug: () => {},
  trace: () => {},
  child: () => consoleLogger,
} as unknown as FastifyBaseLogger;

registerSpineJobs();
registerEspnJobs();
registerYahooJobs();
registerFantasyProsJobs();

const results = await runAllJobsNow(consoleLogger);
console.log("\nsync results:");
let failed = false;
for (const [job, outcome] of Object.entries(results)) {
  console.log(`  ${outcome === "ok" ? "✓" : "✗"} ${job}: ${outcome}`);
  if (outcome !== "ok") failed = true;
}
process.exit(failed ? 1 : 0);
