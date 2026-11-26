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

type SectionCommand =
  | {
      readonly kind: "heading";
      readonly column: number;
      readonly level: LatexSectionLevel;
      readonly title: string;
    }
  | { readonly kind: "trailing"; readonly column: number };

const HEADING = String.raw`\\(${LATEX_SECTION_LEVELS.join("|")})\*?\s*[[{]`;
const TRAILING_MATTER =
  /\\(?:end\s*\{\s*document\s*\}|appendix\b|bibliography\s*\{|bibliographystyle\s*\{|printbibliography\b|begin\s*\{\s*thebibliography\s*\})/;

export function* sectionCommands(maskedLine: string): Generator<SectionCommand> {
  const commands = new RegExp(String.raw`\\\\|${HEADING}|${TRAILING_MATTER.source}`, "g");
  const firstNonWhitespace = maskedLine.search(/\S/);
  for (let match = commands.exec(maskedLine); match; match = commands.exec(maskedLine)) {
    if (match[0] === "\\\\") continue;
    const column = match.index === firstNonWhitespace ? 0 : match.index;
    if (!match[1]) {
      yield { kind: "trailing", column };
      continue;
    }
    const argumentStart = skipOptionalArgument(maskedLine, commands.lastIndex - 1);
    const group = readBalancedGroup(maskedLine, argumentStart);
    if (group) commands.lastIndex = group.endIndex + 1;
    yield {
      kind: "heading",
      column,
      level: match[1] as LatexSectionLevel,
      title: group?.content.trim() ?? "",
    };
  }
}
