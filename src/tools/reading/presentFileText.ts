import { truncateForModel } from "../toolContext.js";
import { numberLines } from "./numberLines.js";
import { readSectionByTitle } from "./readSectionByTitle.js";

export interface PlainTextRead {
  readonly sectionTitle: string | undefined;
  readonly startLine: number | undefined;
  readonly endLine: number | undefined;
}

/** A file's text as a plain read returns it: one section, a numbered line range, or all of it. */
export function presentFileText(path: string, content: string, read: PlainTextRead): string {
  if (read.sectionTitle !== undefined) return readSectionByTitle(path, content, read.sectionTitle);
  if (read.startLine === undefined && read.endLine === undefined) return truncateForModel(content);
  return truncateForModel(numberLines(content, read.startLine, read.endLine));
}
