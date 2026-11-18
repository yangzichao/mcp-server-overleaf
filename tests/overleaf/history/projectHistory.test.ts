import { describe, expect, it } from "vitest";

import { parseCommitLog } from "../../../src/overleaf/history/projectHistory.js";

const RECORD = "\u001e";
const FIELD = "\u001f";

describe("parsing the commit log", () => {
  it("reads each commit with its changed files, keeping the new path of a rename", () => {
    const output = [
      `${RECORD}${"a".repeat(40)}${FIELD}aaaaaaa${FIELD}2026-11-10T14:03:22+01:00${FIELD}Ada${FIELD}Rewrite intro`,
      "M\tmain.tex",
      "R100\told/name.tex\tnew/name.tex",
      "",
      `${RECORD}${"b".repeat(40)}${FIELD}bbbbbbb${FIELD}2026-11-09T09:00:00+01:00${FIELD}Grace${FIELD}Start`,
      "A\tmain.tex",
    ].join("\n");
    expect(parseCommitLog(output)).toEqual([
      {
        hash: "a".repeat(40),
        shortHash: "aaaaaaa",
        date: "2026-11-10T14:03:22+01:00",
        author: "Ada",
        subject: "Rewrite intro",
        changedFiles: [
          { status: "M", path: "main.tex" },
          { status: "R", path: "new/name.tex" },
        ],
      },
      {
        hash: "b".repeat(40),
        shortHash: "bbbbbbb",
        date: "2026-11-09T09:00:00+01:00",
        author: "Grace",
        subject: "Start",
        changedFiles: [{ status: "A", path: "main.tex" }],
      },
    ]);
  });

  it("keeps a subject that contains tabs and returns nothing for empty output", () => {
    const [commit] = parseCommitLog(
      `${RECORD}${"c".repeat(40)}${FIELD}ccccccc${FIELD}2026-11-01${FIELD}Ada${FIELD}a\tb`,
    );
    expect(commit?.subject).toBe("a\tb");
    expect(parseCommitLog("")).toEqual([]);
  });
});
