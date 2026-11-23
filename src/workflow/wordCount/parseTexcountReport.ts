/**
 * Reads what `texcount -nocol -inc` prints. TeXcount 3.1.1, from 2018, is still the version on
 * CTAN and in TeX Live 2025. It prints a block per file, the main file first. A document of
 * several files then gets a "Sum of files" block with the totals. Each problem is a line between
 * "!!!" marks.
 */

/** The seven numbers texcount gives for a file, a section or the whole document. */
export interface TexcountCounts {
  readonly wordsInText: number;
  readonly wordsInHeaders: number;
  /** Words in captions and other text outside the running text. */
  readonly wordsOutsideText: number;
  readonly headers: number;
  /** Floats, tables and figures. */
  readonly floats: number;
  readonly inlineMath: number;
  readonly displayedMath: number;
}

export interface TexcountSectionCount {
  /** As texcount labels it: "_top_" for the text before the first heading, else "Section: Results" and the like. */
  readonly heading: string;
  readonly counts: TexcountCounts;
}

interface TexcountFileCount {
  /** Relative to the directory texcount ran in, without a leading "./". */
  readonly path: string;
  readonly counts: TexcountCounts;
  /** The file's parts by heading. texcount lists them only for a file with more than one part. */
  readonly sections: readonly TexcountSectionCount[];
}

export interface TexcountReport {
  /** The whole document; undefined when texcount counted nothing, as when the main file is unreadable. */
  readonly totals: TexcountCounts | undefined;
  /** The main file, then each included file as texcount reached it. A file included twice is listed twice. */
  readonly files: readonly TexcountFileCount[];
  /** texcount's "!!!" messages, such as an included file it could not find. */
  readonly problems: readonly string[];
}

const FIELD_BY_LABEL = new Map<string, keyof TexcountCounts>([
  ["Words in text", "wordsInText"],
  ["Words in headers", "wordsInHeaders"],
  ["Words outside text (captions, etc.)", "wordsOutsideText"],
  ["Number of headers", "headers"],
  ["Number of floats/tables/figures", "floats"],
  ["Number of math inlines", "inlineMath"],
  ["Number of math displayed", "displayedMath"],
]);

const FILE_BLOCK_START = /^(?:File|Included file): (.+)$/;
const TOTALS_BLOCK_START = /^Sum of files: /;
const COUNT_LINE = /^(.+): (\d+)$/;
/**
 * "  6+1+3 (1/1/1/1) Section: Introduction". A counter the document defines with %TC:newcounter
 * adds "+2cites" after the third number. Its name starts with a non-digit and holds no "+", so
 * the extra counts split one way only and a line that does not match fails fast.
 */
const SUBCOUNT_LINE =
  /^\s+(\d+)\+(\d+)\+(\d+)(?:\+\d+(?:[^\s+\d][^\s+]*)?)* \((\d+)\/(\d+)\/(\d+)\/(\d+)\) (.*)$/;

type WritableCounts = { -readonly [Field in keyof TexcountCounts]: number };

interface OpenBlock {
  readonly counts: WritableCounts;
  /** Undefined for the totals block, whose subcounts repeat the file blocks. */
  readonly sections: TexcountSectionCount[] | undefined;
}

function zeroCounts(): WritableCounts {
  return {
    wordsInText: 0,
    wordsInHeaders: 0,
    wordsOutsideText: 0,
    headers: 0,
    floats: 0,
    inlineMath: 0,
    displayedMath: 0,
  };
}

function readSubcount(match: RegExpExecArray): TexcountSectionCount {
  return {
    heading: (match[8] ?? "").trim(),
    counts: {
      wordsInText: Number(match[1]),
      wordsInHeaders: Number(match[2]),
      wordsOutsideText: Number(match[3]),
      headers: Number(match[4]),
      floats: Number(match[5]),
      inlineMath: Number(match[6]),
      displayedMath: Number(match[7]),
    },
  };
}

/** Not a regular expression: `^!!!\s*(.*?)\s*!!!\s*$` takes cubic time on a line of many spaces. */
function readProblem(line: string): string | undefined {
  const trimmed = line.trimEnd();
  const isProblem = trimmed.length >= 6 && trimmed.startsWith("!!!") && trimmed.endsWith("!!!");
  return isProblem ? trimmed.slice(3, -3).trim() : undefined;
}

function readBlockLine(block: OpenBlock, line: string): void {
  const count = COUNT_LINE.exec(line);
  const field = count ? FIELD_BY_LABEL.get(count[1] ?? "") : undefined;
  if (count && field) {
    block.counts[field] = Number(count[2]);
    return;
  }
  const subcount = SUBCOUNT_LINE.exec(line);
  if (subcount && block.sections) block.sections.push(readSubcount(subcount));
}

export function parseTexcountReport(output: string): TexcountReport {
  const problems: string[] = [];
  const files: TexcountFileCount[] = [];
  let totals: WritableCounts | undefined;
  let block: OpenBlock | undefined;

  for (const line of output.split(/\r?\n/)) {
    const problem = readProblem(line);
    if (problem !== undefined) {
      problems.push(problem);
      continue;
    }
    const fileStart = FILE_BLOCK_START.exec(line);
    if (fileStart) {
      const file = {
        path: (fileStart[1] ?? "").replace(/^(?:\.\/)+/, ""),
        counts: zeroCounts(),
        sections: [] as TexcountSectionCount[],
      };
      files.push(file);
      block = file;
      continue;
    }
    if (TOTALS_BLOCK_START.test(line)) {
      totals = zeroCounts();
      block = { counts: totals, sections: undefined };
      continue;
    }
    if (block) readBlockLine(block, line);
  }

  // A document of one file has no totals block: its file block is the whole document.
  return { totals: totals ?? (files.length === 1 ? files[0]?.counts : undefined), files, problems };
}
