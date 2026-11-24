import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  type BlameRange,
  BlameRefusedError,
  blameFile,
} from "../../../../../src/overleaf/history/blame/blameFile.js";
import type { ProjectHistorySources } from "../../../../../src/overleaf/history/projectHistory.js";
import { expectedBlameLines, generatedBlame, renderBlamePorcelain } from "./generatedBlamePorcelain.js";

const FIELD_SEPARATOR = "\u001f";

/** A clone where the file is committed text, and git blame prints the given porcelain. */
function fakeHistory(porcelain: string) {
  const calls: string[][] = [];
  const sources: ProjectHistorySources = {
    toGitPath: (relativePath) => Promise.resolve(relativePath),
    latestOverleafRevision: () => Promise.resolve("origin/master"),
    git: (args) => {
      calls.push([...args]);
      const answer = (stdout: string) => Promise.resolve({ stdout, stderr: "", exitCode: 0 });
      if (args[0] === "cat-file") return answer("blob\n");
      if (args[0] === "hash-object") return answer("4b825dc642cb6eb9a060e54bf8d69288fbee4904\n");
      if (args[0] === "diff") return answer("3\t0\tmain.tex\n");
      if (args[0] === "blame") return answer(porcelain);
      if (args[0] === "show") {
        const hashes = args.filter((arg) => /^[0-9a-f]{40,64}$/.test(arg));
        return answer(
          hashes
            .map((hash) =>
              [hash, hash.slice(0, 7), "2026-01-01T00:00:00Z", "Ada", `subject ${hash}`].join(
                FIELD_SEPARATOR,
              ),
            )
            .join("\n"),
        );
      }
      return Promise.reject(new Error(`unexpected git ${args.join(" ")}`));
    },
  };
  return { sources, calls };
}

const lineNumber = fc.oneof(
  { weight: 3, arbitrary: fc.integer({ min: 1, max: 1000 }) },
  {
    weight: 1,
    arbitrary: fc.constantFrom(0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 2),
  },
);
const range: fc.Arbitrary<BlameRange> = fc.record(
  { startLine: lineNumber, endLine: lineNumber },
  { requiredKeys: [] },
);

function isValid(given: BlameRange): boolean {
  const values = [given.startLine, given.endLine].filter((value) => value !== undefined);
  if (!values.every((value) => Number.isInteger(value) && value >= 1)) return false;
  return given.startLine === undefined || given.endLine === undefined || given.startLine <= given.endLine;
}

describe("blameFile properties", () => {
  it("refuses a range that is not whole lines from 1 in order before running git, and passes any other to git blame", async () => {
    await fc.assert(
      fc.asyncProperty(range, async (given) => {
        const { sources, calls } = fakeHistory("");
        if (!isValid(given)) {
          await expect(blameFile(sources, "main.tex", given)).rejects.toThrow(BlameRefusedError);
          expect(calls).toEqual([]);
          return;
        }
        await blameFile(sources, "main.tex", given);
        const blameCall = calls.find((args) => args[0] === "blame") ?? [];
        const expected =
          given.startLine === undefined && given.endLine === undefined
            ? []
            : ["-L", `${given.startLine ?? 1},${given.endLine ?? ""}`];
        expect(blameCall.slice(3, -2)).toEqual(expected);
      }),
    );
  });

  it("gives every blamed line its text and commit, and no commit to a line not committed yet", async () => {
    await fc.assert(
      fc.asyncProperty(generatedBlame, async (blame) => {
        const { sources } = fakeHistory(renderBlamePorcelain(blame));
        const result = await blameFile(sources, "main.tex");
        expect(result.deletedInClone).toBe(false);
        expect(
          result.lines.map((line) => ({
            hash: line.commit?.hash ?? "0".repeat(40),
            lineNumber: line.lineNumber,
            text: line.text,
          })),
        ).toEqual(
          expectedBlameLines(blame).map((line) =>
            /^0+$/.test(line.hash) ? { ...line, hash: "0".repeat(40) } : line,
          ),
        );
        for (const line of result.lines)
          if (line.commit) expect(line.commit.subject).toBe(`subject ${line.commit.hash}`);
      }),
    );
  });
});
