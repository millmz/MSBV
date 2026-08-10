import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./config.js";

/**
 * JSON snapshot store. Every dataset MSBV holds (player universe, projections,
 * league snapshots) is a cache of an upstream API and can be re-synced at any
 * time, so a flat file per key is all the persistence we need — no database,
 * no native dependencies, nothing to migrate. Writes are atomic (tmp + rename).
 */

const cacheDir = () => join(DATA_DIR, "cache");

function pathFor(key: string): string {
  if (!/^[a-z0-9_.-]+$/i.test(key)) throw new Error(`bad store key: ${key}`);
  return join(cacheDir(), `${key}.json`);
}

export function storeGet<T>(key: string): T | undefined {
  try {
    return JSON.parse(readFileSync(pathFor(key), "utf8")) as T;
  } catch {
    return undefined;
  }
}

export function storeSet(key: string, value: unknown): void {
  mkdirSync(cacheDir(), { recursive: true });
  const path = pathFor(key);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value));
  renameSync(tmp, path);
}

/** Age of a stored key in milliseconds, or Infinity if absent. */
export function storeAgeMs(key: string): number {
  try {
    return Date.now() - statSync(pathFor(key)).mtimeMs;
  } catch {
    return Infinity;
  }
}

export function storeHas(key: string): boolean {
  return existsSync(pathFor(key));
}
