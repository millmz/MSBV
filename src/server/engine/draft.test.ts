import { describe, expect, it } from "vitest";
import { estimatePicksUntilNext } from "./draft.js";

describe("estimatePicksUntilNext (snake)", () => {
  // 4 teams, order A B C D. Snake: A B C D | D C B A | A B C D ...
  const order = ["A", "B", "C", "D"];

  it("start of draft: distance to my first pick", () => {
    expect(estimatePicksUntilNext(order.slice(0, 0), "A", 4)).toBe(4); // unknown order yet → teamCount
  });

  it("after round 1, the snake turns", () => {
    // 4 picks made (A B C D). Next pick is D again (pick 5).
    expect(estimatePicksUntilNext(["A", "B", "C", "D"], "D", 4)).toBe(0);
    expect(estimatePicksUntilNext(["A", "B", "C", "D"], "A", 4)).toBe(3);
  });

  it("mid-round distances", () => {
    // 5 picks made (A B C D D). Next is C (pick 6): C→0, B→1, A→2.
    const picks = ["A", "B", "C", "D", "D"];
    expect(estimatePicksUntilNext(picks, "C", 4)).toBe(0);
    expect(estimatePicksUntilNext(picks, "B", 4)).toBe(1);
    expect(estimatePicksUntilNext(picks, "A", 4)).toBe(2);
  });

  it("round 3 snakes back to original order", () => {
    // 8 picks: A B C D D C B A → pick 9 is A.
    const picks = ["A", "B", "C", "D", "D", "C", "B", "A"];
    expect(estimatePicksUntilNext(picks, "A", 4)).toBe(0);
    expect(estimatePicksUntilNext(picks, "D", 4)).toBe(3);
  });
});
