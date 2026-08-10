import { parseCsv } from "../../csv.js";

/**
 * FantasyPros subscriber CSV exports. Their API is partner-only, but every
 * subscriber can export rankings (ECR + tiers) and stat projections from the
 * site — we ingest those files. Two shapes:
 *  - rankings: "RK","TIERS","PLAYER NAME","TEAM","POS",...
 *  - projections: Player,Team,...,FPTS  (per-position or FLX export)
 * Column names drift over time, so headers are matched case-insensitively.
 */

export type FpRankingRow = {
  name: string;
  team?: string;
  position?: string;
  rank: number;
  tier?: number;
};

export type FpProjectionRow = {
  name: string;
  team?: string;
  position?: string;
  points: number;
};

function headerKey(row: Record<string, string>, ...aliases: string[]): string | undefined {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const hit = keys.find((k) => k.trim().toLowerCase() === alias);
    if (hit) return hit;
  }
  return undefined;
}

/** "WR12" → "WR"; FantasyPros writes ranked positions in rankings exports. */
function cleanPosition(raw: string | undefined): string | undefined {
  const pos = raw?.trim().toUpperCase().replace(/\d+$/, "");
  return pos || undefined;
}

export function detectFpKind(csv: string): "rankings" | "projections" | undefined {
  const first = parseCsv(csv)[0];
  if (!first) return undefined;
  if (headerKey(first, "player name") && headerKey(first, "rk")) return "rankings";
  if (headerKey(first, "player") && headerKey(first, "fpts")) return "projections";
  return undefined;
}

export function parseFpRankings(csv: string): FpRankingRow[] {
  const rows = parseCsv(csv);
  if (rows.length === 0) return [];
  const first = rows[0]!;
  const nameKey = headerKey(first, "player name");
  const rankKey = headerKey(first, "rk");
  if (!nameKey || !rankKey) return [];
  const teamKey = headerKey(first, "team");
  const posKey = headerKey(first, "pos");
  const tierKey = headerKey(first, "tiers", "tier");

  const out: FpRankingRow[] = [];
  for (const row of rows) {
    const name = row[nameKey]?.trim();
    const rank = Number.parseInt(row[rankKey] ?? "", 10);
    if (!name || !Number.isFinite(rank)) continue;
    const tier = tierKey ? Number.parseInt(row[tierKey] ?? "", 10) : NaN;
    out.push({
      name,
      team: teamKey ? row[teamKey]?.trim() || undefined : undefined,
      position: posKey ? cleanPosition(row[posKey]) : undefined,
      rank,
      tier: Number.isFinite(tier) ? tier : undefined,
    });
  }
  return out;
}

export function parseFpProjections(csv: string): FpProjectionRow[] {
  const rows = parseCsv(csv);
  if (rows.length === 0) return [];
  const first = rows[0]!;
  const nameKey = headerKey(first, "player");
  const fptsKey = headerKey(first, "fpts");
  if (!nameKey || !fptsKey) return [];
  const teamKey = headerKey(first, "team");
  const posKey = headerKey(first, "pos");

  const out: FpProjectionRow[] = [];
  for (const row of rows) {
    const name = row[nameKey]?.trim();
    const points = Number.parseFloat((row[fptsKey] ?? "").replace(/,/g, ""));
    if (!name || !Number.isFinite(points)) continue;
    out.push({
      name,
      team: teamKey ? row[teamKey]?.trim() || undefined : undefined,
      position: posKey ? cleanPosition(row[posKey]) : undefined,
      points,
    });
  }
  return out;
}
