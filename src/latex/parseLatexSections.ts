import { LATEX_SECTION_LEVELS, type LatexSectionLevel, sectionCommands } from "./sections/sectionCommands.js";
import { maskLatexSource } from "./source/prepareLatexSource.js";

export { LATEX_SECTION_LEVELS };

interface SectionRange {
  level: LatexSectionLevel;
  depth: number;
  title: string;
  /** Inclusive, 1-based lines. Columns are zero-based; the end column is exclusive. */
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number | undefined;
}

export type LatexSection = Readonly<SectionRange>;

function closeSections(openSections: SectionRange[], depth: number, line: number, column: number): void {
  for (let section = openSections.at(-1); section && section.depth >= depth; section = openSections.at(-1)) {
    section.endLine = column === 0 ? line - 1 : line;
    section.endColumn = column === 0 ? undefined : column;
    openSections.pop();
  }
}

export function parseLatexSections(latexSource: string): LatexSection[] {
  const lines = maskLatexSource(latexSource).split("\n");
  const sections: SectionRange[] = [];
  const openSections: SectionRange[] = [];
  for (const [lineIndex, line] of lines.entries()) {
    for (const command of sectionCommands(line)) {
      const depth = command.kind === "heading" ? LATEX_SECTION_LEVELS.indexOf(command.level) : -1;
      closeSections(openSections, depth, lineIndex + 1, command.column);
      if (command.kind === "heading") {
        const section = {
          level: command.level,
          title: command.title,
          depth,
          startLine: lineIndex + 1,
          startColumn: command.column,
          endLine: lines.length,
          endColumn: undefined,
        };
        sections.push(section);
        openSections.push(section);
      }
    }
  }
  return sections;
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
  const lines = latexSource.split("\n").slice(section.startLine - 1, section.endLine);
  const last = lines.length - 1;
  lines[last] = (lines[last] ?? "").slice(0, section.endColumn);
  lines[0] = (lines[0] ?? "").slice(section.startColumn);
  return lines.join("\n");
}

export function replaceSectionText(
  latexSource: string,
  section: LatexSection,
  replacementText: string,
): string {
  const lines = latexSource.split("\n");
  const first = section.startLine - 1;
  const prefix = (lines[first] ?? "").slice(0, section.startColumn);
  const suffix =
    section.endColumn === undefined ? "" : (lines[section.endLine - 1] ?? "").slice(section.endColumn);
  lines.splice(first, section.endLine - first, prefix + replacementText + suffix);
  return lines.join("\n");
}
