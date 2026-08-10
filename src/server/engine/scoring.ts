import type { ScoringRules, StatLine } from "../../core/types.js";

/** Score a raw stat line under a league's exact rules. */
export function scoreStatLine(stats: StatLine, rules: ScoringRules): number {
  let total = 0;
  for (const [key, value] of Object.entries(stats)) {
    const points = rules.perStat[key];
    if (points !== undefined && Number.isFinite(value)) total += points * value;
  }
  return total;
}

/** True when a scoring map looks usable (mapping produced real rules). */
export function hasUsableRules(rules: ScoringRules): boolean {
  return Object.keys(rules.perStat).length >= 4;
}

export const PPR_RULES: ScoringRules = {
  label: "PPR",
  perStat: {
    pass_yd: 0.04,
    pass_td: 4,
    pass_int: -2,
    rush_yd: 0.1,
    rush_td: 6,
    rec: 1,
    rec_yd: 0.1,
    rec_td: 6,
    fum_lost: -2,
  },
};
