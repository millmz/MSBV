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
  jobs.push(job);
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
