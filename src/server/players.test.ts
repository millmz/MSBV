import { describe, expect, it } from "vitest";
import type { Player } from "../core/types.js";
import { buildIndex, findByName, normalizeName } from "./players.js";

const player = (over: Partial<Player>): Player => ({
  id: "x",
  name: "Test Player",
  position: "WR",
  ...over,
});

describe("normalizeName", () => {
  it("strips punctuation and suffixes", () => {
    expect(normalizeName("Amon-Ra St. Brown")).toBe("amonra st brown");
    expect(normalizeName("Odell Beckham Jr.")).toBe("odell beckham");
    expect(normalizeName("D'Andre Swift")).toBe("dandre swift");
    expect(normalizeName("Kenneth Walker III")).toBe("kenneth walker");
  });
});

describe("findByName", () => {
  const index = buildIndex([
    player({ id: "1", name: "Josh Allen", position: "QB", team: "BUF" }),
    player({ id: "2", name: "Josh Allen", position: "WR", team: "JAX" }),
    player({ id: "3", name: "Lamar Jackson", position: "QB", team: "BAL" }),
  ]);

  it("disambiguates same-name players by position", () => {
    expect(findByName(index, "Josh Allen", "QB")?.id).toBe("1");
    expect(findByName(index, "Josh Allen", "WR")?.id).toBe("2");
  });

  it("matches through punctuation differences", () => {
    expect(findByName(index, "lamar jackson")?.id).toBe("3");
  });

  it("returns undefined for unknown names", () => {
    expect(findByName(index, "Nobody Special")).toBeUndefined();
  });
});
