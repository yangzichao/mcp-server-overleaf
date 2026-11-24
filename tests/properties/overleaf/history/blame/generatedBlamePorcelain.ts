import fc from "fast-check";

import type { PorcelainBlameLine } from "../../../../../src/overleaf/history/blame/parseBlamePorcelain.js";

/**
 * `git blame --porcelain` output, laid out as git's emit_porcelain prints it: a header row for
 * every line, the commit's details only the first time the commit appears, the filename again
 * for a commit that touched more than one path, and each line's text after a tab.
 */

interface GeneratedCommit {
  readonly hash: string;
  readonly author: string;
  readonly summary: string;
  readonly isBoundary: boolean;
  readonly previous: string | undefined;
  readonly filename: string;
  readonly touchedMoreThanOnePath: boolean;
}

interface GeneratedLine {
  readonly commitIndex: number;
  readonly lineInCommit: number;
  readonly text: string;
  readonly startsGroup: boolean;
}

export interface GeneratedBlame {
  readonly commits: readonly GeneratedCommit[];
  readonly lines: readonly GeneratedLine[];
  readonly lineEnd: "\n" | "\r\n";
}

const SHA1 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const hash = fc.oneof(fc.stringMatching(SHA1), fc.stringMatching(SHA256), fc.constant("0".repeat(40)));

const HEADER_LOOKALIKE = `${"a".repeat(40)} 1 2 3`;
const words = (pieces: readonly string[]) =>
  fc.array(fc.constantFrom(...pieces), { maxLength: 6 }).map((chosen) => chosen.join(""));

const commit: fc.Arbitrary<GeneratedCommit> = fc.record({
  hash,
  author: words(["Ada", " ", "Lovelace", "\t", "Ж", "Not Committed Yet", HEADER_LOOKALIKE]),
  summary: words(["Fix", " ", "\t", "typo", "filename x", "boundary", HEADER_LOOKALIKE, "é"]),
  isBoundary: fc.boolean(),
  previous: fc.option(
    fc
      .tuple(fc.stringMatching(SHA1), fc.constantFrom("main.tex", "a b.tex", '"tab\\there.tex"'))
      .map(([previousHash, name]) => `${previousHash} ${name}`),
    { nil: undefined },
  ),
  filename: fc.constantFrom("main.tex", "chapters/a b.tex", '"tab\\there.tex"', "été.tex"),
  touchedMoreThanOnePath: fc.boolean(),
});

const lineText = words([
  "x",
  " ",
  "\t",
  "%",
  "\\section{A}",
  HEADER_LOOKALIKE,
  "author A",
  "\r x",
  "é",
  "论文",
]);

export const generatedBlame: fc.Arbitrary<GeneratedBlame> = fc
  .uniqueArray(commit, { minLength: 1, maxLength: 4, selector: (generated) => generated.hash })
  .chain((commits) =>
    fc.record({
      commits: fc.constant(commits),
      lines: fc.array(
        fc.record({
          commitIndex: fc.nat({ max: commits.length - 1 }),
          lineInCommit: fc.integer({ min: 1, max: 500 }),
          text: lineText,
          startsGroup: fc.boolean(),
        }),
        { maxLength: 12 },
      ),
      lineEnd: fc.constantFrom("\n" as const, "\r\n" as const),
    }),
  );

function detailRows(generated: GeneratedCommit): string[] {
  return [
    `author ${generated.author}`,
    "author-mail <ada@example.com>",
    "author-time 1700000000",
    "author-tz +0100",
    `committer ${generated.author}`,
    "committer-mail <ada@example.com>",
    "committer-time 1700000000",
    "committer-tz +0100",
    `summary ${generated.summary}`,
    ...(generated.previous === undefined ? [] : [`previous ${generated.previous}`]),
    ...(generated.isBoundary ? ["boundary"] : []),
  ];
}

function groupStarts(blame: GeneratedBlame): boolean[] {
  return blame.lines.map(
    (line, index) =>
      index === 0 || line.startsGroup || blame.lines[index - 1]?.commitIndex !== line.commitIndex,
  );
}

export function renderBlamePorcelain(blame: GeneratedBlame): string {
  const starts = groupStarts(blame);
  const shown = new Set<number>();
  const rows: string[] = [];
  blame.lines.forEach((line, index) => {
    const generated = blame.commits[line.commitIndex] as GeneratedCommit;
    const finalLine = index + 1;
    if (starts[index]) {
      let groupSize = 1;
      while (index + groupSize < blame.lines.length && !starts[index + groupSize]) groupSize += 1;
      rows.push(`${generated.hash} ${line.lineInCommit} ${finalLine} ${groupSize}`);
      if (!shown.has(line.commitIndex)) {
        shown.add(line.commitIndex);
        rows.push(...detailRows(generated), `filename ${generated.filename}`);
      } else if (generated.touchedMoreThanOnePath) {
        rows.push(`filename ${generated.filename}`);
      }
    } else {
      rows.push(`${generated.hash} ${line.lineInCommit} ${finalLine}`);
    }
    rows.push(`\t${line.text}${blame.lineEnd === "\r\n" ? "\r" : ""}`);
  });
  return rows.length === 0 ? "" : `${rows.join("\n")}\n`;
}

export function expectedBlameLines(blame: GeneratedBlame): PorcelainBlameLine[] {
  return blame.lines.map((line, index) => ({
    hash: (blame.commits[line.commitIndex] as GeneratedCommit).hash,
    lineNumber: index + 1,
    text: line.text,
  }));
}
