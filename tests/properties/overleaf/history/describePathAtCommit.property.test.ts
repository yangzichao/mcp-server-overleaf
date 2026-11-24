import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { describePathAtCommit } from "../../../../src/overleaf/history/describePathAtCommit.js";

const objectType = fc.oneof(
  fc.constantFrom("blob", "tree", "commit", "tag", "", "BLOB", "blobs"),
  fc.string({ maxLength: 6 }),
);
const around = fc.constantFrom("", "\n", " ", "\r\n");

describe("describePathAtCommit properties", () => {
  it("names a blob a file and a tree a folder, and anything else, or a failed lookup, missing", async () => {
    await fc.assert(
      fc.asyncProperty(
        objectType,
        around,
        fc.constantFrom(0, 1, 128, null),
        fc.constantFrom("HEAD", "a".repeat(40)),
        fc.constantFrom("main.tex", "a b/c.tex", ":colon", "北京.tex"),
        async (type, spacing, exitCode, commitHash, gitPath) => {
          const asked: string[][] = [];
          const kind = await describePathAtCommit(
            (args) => {
              asked.push([...args]);
              return Promise.resolve({ stdout: `${spacing}${type}${spacing}`, stderr: "", exitCode });
            },
            commitHash,
            gitPath,
          );
          expect(asked).toEqual([["cat-file", "-t", `${commitHash}:${gitPath}`]]);
          const printed = type.trim();
          const expected =
            exitCode !== 0
              ? "missing"
              : printed === "blob"
                ? "file"
                : printed === "tree"
                  ? "folder"
                  : "missing";
          expect(kind).toBe(expected);
        },
      ),
    );
  });
});
