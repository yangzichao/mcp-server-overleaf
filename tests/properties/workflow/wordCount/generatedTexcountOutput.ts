import fc from "fast-check";

import type {
  TexcountCounts,
  TexcountReport,
  TexcountSectionCount,
} from "../../../../src/workflow/wordCount/parseTexcountReport.js";

/**
 * What `texcount -nocol -inc` prints, built from the counts it reports, in the layout of the
 * TeXcount 3.1.1 runs copied into tests/workflow/wordCount/parseTexcountReport.test.ts.
 */

interface GeneratedSection {
  readonly heading: string;
  readonly counts: TexcountCounts;
  /** What a counter the document defines with %TC:newcounter adds, as `+1cites`. */
  readonly extraCounts: readonly string[];
}

interface GeneratedFile {
  /** As texcount names it relative to where it ran, without the "./" it prints. */
  readonly path: string;
  readonly counts: TexcountCounts;
  readonly sections: readonly GeneratedSection[];
  readonly citations: number | undefined;
}

interface GeneratedProblem {
  readonly message: string;
  readonly spaceBefore: string;
  readonly spaceAfter: string;
  readonly spaceAtEnd: string;
  /** Where among the other lines the problem is printed. */
  readonly position: number;
}

export interface GeneratedTexcountOutput {
  readonly files: readonly GeneratedFile[];
  /** The "Sum of files" block texcount prints for a document of several files. */
  readonly sumOfFiles: TexcountCounts | undefined;
  readonly problems: readonly GeneratedProblem[];
  readonly lineEnd: "\n" | "\r\n";
}

const COUNT_LABELS: ReadonlyArray<readonly [string, keyof TexcountCounts]> = [
  ["Words in text", "wordsInText"],
  ["Words in headers", "wordsInHeaders"],
  ["Words outside text (captions, etc.)", "wordsOutsideText"],
  ["Number of headers", "headers"],
  ["Number of floats/tables/figures", "floats"],
  ["Number of math inlines", "inlineMath"],
  ["Number of math displayed", "displayedMath"],
];

const count = fc.nat({ max: 100_000 });
const counts: fc.Arbitrary<TexcountCounts> = fc.record({
  wordsInText: count,
  wordsInHeaders: count,
  wordsOutsideText: count,
  headers: count,
  floats: count,
  inlineMath: count,
  displayedMath: count,
});

const words = (pieces: readonly string[], maxLength: number) =>
  fc.array(fc.constantFrom(...pieces), { minLength: 1, maxLength }).map((chosen) => chosen.join(""));

const heading = fc.oneof(
  fc.constant("_top_"),
  words(
    ["Section: ", "Subsection: ", "Results", "A b", " ", "1.2", "(x)", "+", "/", ": 7", "é", "论文", "𝔸"],
    6,
  ),
);
const extraCount = fc
  .tuple(count, fc.constantFrom("cites", "refs", "x", "é"))
  .map(([value, name]) => `+${value}${name}`);
const section: fc.Arbitrary<GeneratedSection> = fc.record({
  heading,
  counts,
  extraCounts: fc.array(extraCount, { maxLength: 2 }),
});

const path = fc
  .array(fc.constantFrom("main", "sections", "a b", "chapter-1", "été", "x.y", "!!!"), {
    minLength: 1,
    maxLength: 3,
  })
  .map((segments) => `${segments.join("/")}.tex`);
const file: fc.Arbitrary<GeneratedFile> = fc.record({
  path,
  counts,
  sections: fc.array(section, { maxLength: 3 }),
  citations: fc.option(count, { nil: undefined }),
});

const space = fc.constantFrom("", " ", "  ", "\t", " ");
const problem: fc.Arbitrary<GeneratedProblem> = fc.record({
  message: words(["File", " ", "missing", "not found in path [./].", "!", "!!!", ":", "\t", "\r", "é"], 8),
  spaceBefore: space,
  spaceAfter: space,
  spaceAtEnd: space,
  position: fc.nat(),
});

export const texcountOutput: fc.Arbitrary<GeneratedTexcountOutput> = fc.record({
  files: fc.array(file, { maxLength: 4 }),
  sumOfFiles: fc.option(counts, { nil: undefined }),
  problems: fc.array(problem, { maxLength: 3 }),
  lineEnd: fc.constantFrom("\n" as const, "\r\n" as const),
});

function countLines(values: TexcountCounts): string[] {
  return COUNT_LABELS.map(([label, field]) => `${label}: ${values[field]}`);
}

function subcountLine(values: TexcountCounts, extraCounts: readonly string[], label: string): string {
  const { wordsInText, wordsInHeaders, wordsOutsideText, headers, floats, inlineMath, displayedMath } =
    values;
  const textCounts = `${wordsInText}+${wordsInHeaders}+${wordsOutsideText}${extraCounts.join("")}`;
  return `  ${textCounts} (${headers}/${floats}/${inlineMath}/${displayedMath}) ${label}`;
}

const SUBCOUNTS_HEADER = ["Subcounts:", "  text+headers+captions (#headers/#floats/#inlines/#displayed)"];

function fileBlock(generated: GeneratedFile, index: number): string[] {
  const opening = index === 0 ? "File" : "Included file";
  return [
    `${opening}: ./${generated.path}`,
    "Encoding: utf8",
    ...countLines(generated.counts),
    ...(generated.citations === undefined ? [] : [`Citations: ${generated.citations}`]),
    ...(generated.sections.length === 0
      ? []
      : [
          ...SUBCOUNTS_HEADER,
          ...generated.sections.map((part) => subcountLine(part.counts, part.extraCounts, part.heading)),
        ]),
    "",
  ];
}

function sumOfFilesBlock(output: GeneratedTexcountOutput, totals: TexcountCounts): string[] {
  const mainPath = output.files[0]?.path ?? "main.tex";
  return [
    `Sum of files: ./${mainPath}`,
    `File(s) total: ./${mainPath}`,
    ...countLines(totals),
    `Files: ${output.files.length}`,
    ...SUBCOUNTS_HEADER,
    ...output.files.map((generated, index) =>
      subcountLine(generated.counts, [], `${index === 0 ? "File" : "Included file"}: ./${generated.path}`),
    ),
    "",
  ];
}

/** The output's lines, each problem placed among the others where the generator put it. */
function layOutLines(output: GeneratedTexcountOutput): Array<string | GeneratedProblem> {
  const lines: Array<string | GeneratedProblem> = [
    "",
    ...output.files.flatMap(fileBlock),
    ...(output.sumOfFiles === undefined ? [] : sumOfFilesBlock(output, output.sumOfFiles)),
  ];
  for (const generated of output.problems) {
    lines.splice(generated.position % (lines.length + 1), 0, generated);
  }
  if (output.problems.length > 0) lines.push("(errors:1)");
  return [...lines, ""];
}

export function renderTexcountOutput(output: GeneratedTexcountOutput): string {
  return layOutLines(output)
    .map((line) =>
      typeof line === "string"
        ? line
        : `!!!${line.spaceBefore}${line.message}${line.spaceAfter}!!!${line.spaceAtEnd}`,
    )
    .join(output.lineEnd);
}

/** What parseTexcountReport should read back from the rendered output. */
export function expectedTexcountReport(output: GeneratedTexcountOutput): TexcountReport {
  const files = output.files.map((generated) => ({
    path: generated.path,
    counts: generated.counts,
    sections: generated.sections.map(
      (part): TexcountSectionCount => ({ heading: part.heading.trim(), counts: part.counts }),
    ),
  }));
  const problems = layOutLines(output).flatMap((line) =>
    typeof line === "string" ? [] : [line.message.trim()],
  );
  const lonelyFileCounts = files.length === 1 ? files[0]?.counts : undefined;
  return { totals: output.sumOfFiles ?? lonelyFileCounts, files, problems };
}
