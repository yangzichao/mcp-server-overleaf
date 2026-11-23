import { describe, expect, it } from "vitest";

import { parseBlamePorcelain } from "../../../src/overleaf/history/blame/parseBlamePorcelain.js";

const first = "a".repeat(40);
const uncommitted = "0".repeat(40);

describe("parseBlamePorcelain", () => {
  it("reads each line's commit, number and text, with details only on a commit's first line", () => {
    const output = [
      `${first} 1 1 2`,
      "author Ada",
      "author-mail <ada@example.com>",
      "summary Start",
      "boundary",
      "filename main.tex",
      "\tfirst line",
      `${first} 2 2`,
      "\t\tindented with a tab",
      `${uncommitted} 3 3 1`,
      "author Not Committed Yet",
      "summary Version of main.tex from main.tex",
      "filename main.tex",
      "\tlocal edit\r",
      "",
    ].join("\n");
    expect(parseBlamePorcelain(output)).toEqual([
      { hash: first, lineNumber: 1, text: "first line" },
      { hash: first, lineNumber: 2, text: "\tindented with a tab" },
      { hash: uncommitted, lineNumber: 3, text: "local edit" },
    ]);
  });

  it("does not mistake a line of text that looks like a header for one", () => {
    const output = [`${first} 1 1 1`, "filename a.tex", `\t${first} 9 9 9`, ""].join("\n");
    expect(parseBlamePorcelain(output)).toEqual([{ hash: first, lineNumber: 1, text: `${first} 9 9 9` }]);
  });

  it("returns nothing for an empty file", () => {
    expect(parseBlamePorcelain("")).toEqual([]);
  });
});
