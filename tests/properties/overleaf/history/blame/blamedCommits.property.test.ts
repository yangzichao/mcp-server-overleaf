import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  type BlameCommit,
  describeBlamedCommits,
} from "../../../../../src/overleaf/history/blame/blamedCommits.js";
import type { HistoryGitRunner } from "../../../../../src/overleaf/history/projectHistory.js";

const FIELD_SEPARATOR = "\u001f";

const words = (pieces: readonly string[]) =>
  fc.array(fc.constantFrom(...pieces), { maxLength: 5 }).map((chosen) => chosen.join(""));

/**
 * Commits as `git show --format=%H…%s` describes them. The separator stays out of every field
 * but the subject, which comes last and is read whole; the commit log reads it the same way.
 */
const commits = fc.uniqueArray(
  fc.record({
    hash: fc.stringMatching(/^[0-9a-f]{40}$/),
    shortLength: fc.integer({ min: 7, max: 12 }),
    date: fc.constantFrom("2026-11-23T10:00:00+01:00", "1999-01-01T00:00:00-12:00"),
    author: words(["Ada", " ", "Lovelace", "\t", "Ж", "|"]),
    subject: words(["Fix", " ", "\t", FIELD_SEPARATOR, "é", "%s"]),
  }),
  { maxLength: 250, selector: (generated) => generated.hash },
);

describe("describeBlamedCommits properties", () => {
  it("reads every commit once, a hundred at most to a git show", async () => {
    await fc.assert(
      fc.asyncProperty(commits, async (generated) => {
        const byHash = new Map(generated.map((one) => [one.hash, one]));
        const requested: string[] = [];
        const git: HistoryGitRunner = (args) => {
          const separatorAt = args.indexOf("--");
          const hashes = args.slice(args.findIndex((arg) => arg.startsWith("--format=")) + 1, separatorAt);
          expect(hashes.length).toBeLessThanOrEqual(100);
          requested.push(...hashes);
          const rows = hashes.map((hash) => {
            const one = byHash.get(hash);
            if (!one) return "";
            return [hash, hash.slice(0, one.shortLength), one.date, one.author, one.subject].join(
              FIELD_SEPARATOR,
            );
          });
          return Promise.resolve({ stdout: `${rows.join("\n")}\n`, stderr: "", exitCode: 0 });
        };
        const described = await describeBlamedCommits(
          git,
          generated.map((one) => one.hash),
        );
        expect(requested).toEqual(generated.map((one) => one.hash));
        const expected = new Map<string, BlameCommit>(
          generated.map((one) => [
            one.hash,
            {
              hash: one.hash,
              shortHash: one.hash.slice(0, one.shortLength),
              date: one.date,
              author: one.author,
              subject: one.subject,
            },
          ]),
        );
        expect(described).toEqual(expected);
      }),
    );
  });
});
