import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { type CommitSummary, parseCommitLog } from "../../../../src/overleaf/history/projectHistory.js";

const RECORD_SEPARATOR = "\u001e";
const FIELD_SEPARATOR = "\u001f";

/** Free text Git can print in a field: anything but the separators and a newline. */
const fieldText = fc
  .string({ unit: "grapheme" })
  .map((text) =>
    [RECORD_SEPARATOR, FIELD_SEPARATOR, "\n", "\r"].reduce(
      (cleaned, separator) => cleaned.replaceAll(separator, " "),
      text,
    ),
  );
const changedPath = fc.stringMatching(/^[A-Za-z0-9 ._/北京-]{1,16}$/).filter((path) => path.trim() !== "");
const changedFile = fc.oneof(
  fc
    .tuple(fc.constantFrom("A", "M", "D", "T"), changedPath)
    .map(([status, path]) => ({ status, line: `${status}\t${path}`, path })),
  fc.tuple(fc.constantFrom("R100", "R087", "C075"), changedPath, changedPath).map(([status, from, to]) => ({
    status: status.charAt(0),
    line: `${status}\t${from}\t${to}`,
    path: to,
  })),
);
const commit = fc.record({
  hash: fc.stringMatching(/^[0-9a-f]{40}$/),
  date: fc
    .date({ noInvalidDate: true, min: new Date("1970-01-01"), max: new Date("2099-12-31") })
    .map((date) => date.toISOString()),
  author: fieldText,
  subject: fc.oneof(fieldText, fc.constant("Subject\twith\ttabs")),
  changedFiles: fc.array(changedFile, { maxLength: 4 }),
});
type WrittenCommit = typeof commit extends fc.Arbitrary<infer Written> ? Written : never;

/** What `git log --pretty=format:<separators> --name-status` prints for these commits. */
function renderLog(commits: readonly WrittenCommit[]): string {
  return commits
    .map((written) => {
      const header = [
        written.hash,
        written.hash.slice(0, 7),
        written.date,
        written.author,
        written.subject,
      ].join(FIELD_SEPARATOR);
      const files = written.changedFiles.map((file) => file.line).join("\n");
      return `${RECORD_SEPARATOR}${header}\n${files === "" ? "" : `\n${files}\n`}`;
    })
    .join("");
}

function expectedSummary(written: WrittenCommit): CommitSummary {
  return {
    hash: written.hash,
    shortHash: written.hash.slice(0, 7),
    date: written.date,
    author: written.author,
    subject: written.subject,
    changedFiles: written.changedFiles.map((file) => ({ status: file.status, path: file.path })),
  };
}

describe("parseCommitLog properties", () => {
  it("reads back every commit Git printed, with its fields and the current path of each changed file", () => {
    fc.assert(
      fc.property(fc.array(commit, { maxLength: 5 }), (commits) => {
        expect(parseCommitLog(renderLog(commits))).toEqual(commits.map(expectedSummary));
      }),
    );
  });

  it("never throws on arbitrary output and never returns a commit without a hash", () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(fc.string(), fc.constantFrom(RECORD_SEPARATOR, FIELD_SEPARATOR, "\n", "\t")), {
          maxLength: 20,
        }),
        (pieces) => {
          for (const parsed of parseCommitLog(pieces.join(""))) {
            expect(parsed.hash).not.toBe("");
            expect(parsed.shortHash).not.toBe("");
          }
        },
      ),
    );
  });
});
