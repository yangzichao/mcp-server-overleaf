export const LATEX_SECTION_LEVELS = [
  "part",
  "chapter",
  "section",
  "subsection",
  "subsubsection",
  "paragraph",
  "subparagraph",
] as const;

export type LatexSectionLevel = (typeof LATEX_SECTION_LEVELS)[number];

export interface LatexSection {
  readonly level: LatexSectionLevel;
  readonly depth: number;
  readonly title: string;
  /** 1-indexed line of the sectioning command itself. */
  readonly startLine: number;
  /** 1-indexed last line belonging to this section. */
  readonly endLine: number;
}

const SECTION_COMMAND_PATTERN = new RegExp(`\\\\(${LATEX_SECTION_LEVELS.join("|")})\\*?\\s*(\\[|\\{)`);

/** Reads a balanced `{...}` group starting at `openBraceIndex`, tolerating nested braces. */
function readBalancedGroup(
  text: string,
  openBraceIndex: number,
): { content: string; endIndex: number } | null {
  if (text[openBraceIndex] !== "{") return null;
  let depth = 0;
  for (let index = openBraceIndex; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return { content: text.slice(openBraceIndex + 1, index), endIndex: index };
      }
    }
  }
  return null;
}

/** Strips an optional `[...]` argument so `\section[short]{long}` resolves to the long title. */
function skipOptionalArgument(text: string, startIndex: number): number {
  if (text[startIndex] !== "[") return startIndex;
  let depth = 0;
  for (let index = startIndex; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === "[") depth += 1;
    else if (character === "]") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return startIndex;
}

function stripLineComment(line: string): string {
  let result = "";
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "\\") {
      result += line.slice(index, index + 2);
      index += 1;
      continue;
    }
    if (character === "%") break;
    result += character;
  }
  return result;
}

/**
 * Matter that follows the prose but belongs to nobody's section. Without this a section
 * that happens to be last would swallow `\end{document}` or the bibliography, and
 * rewriting it would silently delete them.
 */
const TRAILING_MATTER_PATTERN =
  /\\(end\s*\{\s*document\s*\}|appendix\b|bibliography\s*\{|bibliographystyle\s*\{|printbibliography\b|begin\s*\{\s*thebibliography\s*\})/;

/**
 * 1-indexed line of the first trailing-matter command at or after `fromLine`, or null.
 */
function findTrailingMatterLine(lines: readonly string[], fromLine: number): number | null {
  for (let lineIndex = fromLine - 1; lineIndex < lines.length; lineIndex += 1) {
    if (TRAILING_MATTER_PATTERN.test(stripLineComment(lines[lineIndex] ?? ""))) {
      return lineIndex + 1;
    }
  }
  return null;
}

/**
 * Locates the sectioning commands in a LaTeX source file so tools can address
 * "Section 4" instead of a line range that shifts on every edit.
 */
export function parseLatexSections(latexSource: string): LatexSection[] {
  const lines = latexSource.split("\n");
  const found: Array<Omit<LatexSection, "endLine">> = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const uncommentedLine = stripLineComment(lines[lineIndex] ?? "");
    const match = SECTION_COMMAND_PATTERN.exec(uncommentedLine);
    if (!match || match.index === undefined) continue;

    const level = match[1] as LatexSectionLevel;
    const argumentStartIndex = skipOptionalArgument(uncommentedLine, match.index + match[0].length - 1);
    const group = readBalancedGroup(uncommentedLine, argumentStartIndex);

    found.push({
      level,
      depth: LATEX_SECTION_LEVELS.indexOf(level),
      title: (group?.content ?? "").trim(),
      startLine: lineIndex + 1,
    });
  }

  return found.map((section, index) => {
    const nextSameOrShallower = found.findIndex(
      (candidate, candidateIndex) => candidateIndex > index && candidate.depth <= section.depth,
    );
    const nextSection = nextSameOrShallower === -1 ? undefined : found[nextSameOrShallower];
    const endAtNextSection = nextSection ? nextSection.startLine - 1 : lines.length;

    // A section stops at whichever comes first: the next sibling heading, or the
    // trailing matter that is not prose at all.
    const trailingMatterLine = findTrailingMatterLine(lines, section.startLine + 1);
    const endLine =
      trailingMatterLine === null ? endAtNextSection : Math.min(endAtNextSection, trailingMatterLine - 1);

    return { ...section, endLine: Math.max(endLine, section.startLine) };
  });
}

/** Case-insensitive match on the section title, falling back to a substring match. */
export function findSectionByTitle(
  sections: readonly LatexSection[],
  requestedTitle: string,
): LatexSection | null {
  const normalized = requestedTitle.trim().toLowerCase();
  return (
    sections.find((section) => section.title.toLowerCase() === normalized) ??
    sections.find((section) => section.title.toLowerCase().includes(normalized)) ??
    null
  );
}

export function extractSectionText(latexSource: string, section: LatexSection): string {
  return latexSource
    .split("\n")
    .slice(section.startLine - 1, section.endLine)
    .join("\n");
}

export function replaceSectionText(
  latexSource: string,
  section: LatexSection,
  replacementText: string,
): string {
  const lines = latexSource.split("\n");
  const before = lines.slice(0, section.startLine - 1);
  const after = lines.slice(section.endLine);
  return [...before, ...replacementText.split("\n"), ...after].join("\n");
}
