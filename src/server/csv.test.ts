import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv.js";

describe("parseCsv", () => {
  it("parses simple rows into objects", () => {
    const rows = parseCsv("a,b,c\n1,2,3\n4,5,6\n");
    expect(rows).toEqual([
      { a: "1", b: "2", c: "3" },
      { a: "4", b: "5", c: "6" },
    ]);
  });

  it("handles quoted fields with commas and escaped quotes", () => {
    const rows = parseCsv('name,team\n"Smith, John","KC"\n"O""Brien",NE\n');
    expect(rows).toEqual([
      { name: "Smith, John", team: "KC" },
      { name: 'O"Brien', team: "NE" },
    ]);
  });

  it("handles CRLF and missing trailing newline", () => {
    const rows = parseCsv("a,b\r\n1,2\r\n3,4");
    expect(rows).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });
});
