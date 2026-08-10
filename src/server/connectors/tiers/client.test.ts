import { describe, expect, it } from "vitest";
import { parseTierText } from "./client.js";

describe("parseTierText", () => {
  it("parses Boris Chen tier lines", () => {
    const text = [
      "Tier 1: Justin Jefferson, CeeDee Lamb",
      "Tier 2: A.J. Brown, Amon-Ra St. Brown, Puka Nacua",
      "",
      "Tier 3: Nico Collins",
    ].join("\n");
    const tiers = parseTierText(text);
    expect(tiers).toHaveLength(3);
    expect(tiers[0]).toEqual(["Justin Jefferson", "CeeDee Lamb"]);
    expect(tiers[1]).toContain("Amon-Ra St. Brown");
  });

  it("returns empty for junk", () => {
    expect(parseTierText("<html>error</html>")).toEqual([]);
  });
});
