import { fetchText } from "../../http.js";
import type { Position, TierChart } from "../../../core/types.js";

/**
 * Boris Chen publishes expert-consensus tier charts (clustered FantasyPros
 * ECR) as plain text files on S3, refreshed through the season.
 * Format: one line per tier — "Tier 1: Player A, Player B, ...".
 */
const BASE = "https://s3-us-west-1.amazonaws.com/fftiers/out";

const FILES: Record<string, Record<string, string>> = {
  ppr: {
    QB: "text_QB.txt",
    RB: "text_RB-PPR.txt",
    WR: "text_WR-PPR.txt",
    TE: "text_TE-PPR.txt",
    FLEX: "text_FLX-PPR.txt",
    K: "text_K.txt",
    DST: "text_DST.txt",
  },
  half: {
    QB: "text_QB.txt",
    RB: "text_RB-HALF.txt",
    WR: "text_WR-HALF.txt",
    TE: "text_TE-HALF.txt",
    FLEX: "text_FLX-HALF.txt",
    K: "text_K.txt",
    DST: "text_DST.txt",
  },
  std: {
    QB: "text_QB.txt",
    RB: "text_RB.txt",
    WR: "text_WR.txt",
    TE: "text_TE.txt",
    FLEX: "text_FLX.txt",
    K: "text_K.txt",
    DST: "text_DST.txt",
  },
};

export function parseTierText(text: string): string[][] {
  const tiers: string[][] = [];
  for (const line of text.split("\n")) {
    const match = line.match(/^Tier\s+(\d+):\s*(.+)$/i);
    if (!match) continue;
    const names = match[2]!
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length > 0) tiers.push(names);
  }
  return tiers;
}

export async function fetchTierChart(
  scoring: "ppr" | "half" | "std",
  position: Position | "FLEX",
): Promise<TierChart | undefined> {
  const file = FILES[scoring]?.[position];
  if (!file) return undefined;
  try {
    const text = await fetchText(`${BASE}/${file}`, { timeoutMs: 15_000 });
    const tiers = parseTierText(text);
    if (tiers.length === 0) return undefined;
    return { scoring, position, tiers, fetchedAt: new Date().toISOString() };
  } catch {
    return undefined; // tiers are additive signal — never fatal
  }
}

export async function fetchAllTierCharts(scoring: "ppr" | "half" | "std"): Promise<TierChart[]> {
  const positions = Object.keys(FILES[scoring]!) as (Position | "FLEX")[];
  const charts = await Promise.all(positions.map((p) => fetchTierChart(scoring, p)));
  return charts.filter((c): c is TierChart => Boolean(c));
}
