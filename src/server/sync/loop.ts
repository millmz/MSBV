import type { FastifyBaseLogger } from "fastify";

/**
 * Background sync loop. Each milestone registers its sync jobs here; jobs are
 * cheap no-ops when their data source isn't configured yet.
 */

export type SyncJob = {
  name: string;
  /** Minimum time between runs. */
  intervalMs: number;
  run: (log: FastifyBaseLogger) => Promise<void>;
};

const jobs: SyncJob[] = [];

export function registerSyncJob(job: SyncJob) {
  if (jobs.some((j) => j.name === job.name)) return;
  jobs.push(job);
}

/** Force-run every job now (manual re-sync button). Returns per-job outcome. */
export async function runAllJobsNow(log: FastifyBaseLogger): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  for (const job of jobs) {
    try {
      await job.run(log);
      results[job.name] = "ok";
    } catch (err) {
      results[job.name] = err instanceof Error ? err.message : String(err);
    }
  }
  return results;
}

export function startSyncLoop(log: FastifyBaseLogger, tickMs = 60_000) {
  const lastRun = new Map<string, number>();

  const tick = async () => {
    for (const job of jobs) {
      const last = lastRun.get(job.name) ?? 0;
      if (Date.now() - last < job.intervalMs) continue;
      lastRun.set(job.name, Date.now());
      try {
        await job.run(log);
      } catch (err) {
        log.warn({ err, job: job.name }, "sync job failed");
      }
    }
  };

  void tick();
  const timer = setInterval(tick, tickMs);
  timer.unref();
  return () => clearInterval(timer);
}
