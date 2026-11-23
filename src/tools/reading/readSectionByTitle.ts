import {
  extractSectionText,
  findSectionByTitle,
  type LatexSection,
  parseLatexSections,
} from "../../latex/parseLatexSections.js";
import { truncateForModel } from "../toolContext.js";

export function requireSectionByTitle(path: string, content: string, sectionTitle: string): LatexSection {
  const sections = parseLatexSections(content);
  const section = findSectionByTitle(sections, sectionTitle);
  if (section) return section;
  const titles = sections.map((entry) => entry.title);
  throw new Error(
    titles.length === 0
      ? `No section matching "${sectionTitle}" in ${path}, which has no section headings.`
      : `No section matching "${sectionTitle}" in ${path}. Available: ${titles.join(", ")}`,
  );
}

/** One section's source, from its heading to the next heading at the same or a shallower level. */
export function readSectionByTitle(path: string, content: string, sectionTitle: string): string {
  return truncateForModel(extractSectionText(content, requireSectionByTitle(path, content, sectionTitle)));
}
