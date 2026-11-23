import {
  extractSectionText,
  findSectionByTitle,
  parseLatexSections,
} from "../../latex/parseLatexSections.js";
import { truncateForModel } from "../toolContext.js";

/** Lists the titles that exist, so a near miss can be corrected without another call. */
export function describeMissingSection(
  path: string,
  sectionTitle: string,
  titles: readonly string[],
): string {
  return `No section matching "${sectionTitle}" in ${path}. Available: ${titles.join(", ")}`;
}

/** One section's source, from its heading to the next heading at the same or a shallower level. */
export function readSectionByTitle(path: string, content: string, sectionTitle: string): string {
  const sections = parseLatexSections(content);
  const section = findSectionByTitle(sections, sectionTitle);
  if (!section) {
    return describeMissingSection(
      path,
      sectionTitle,
      sections.map((entry) => entry.title),
    );
  }
  return truncateForModel(extractSectionText(content, section));
}
