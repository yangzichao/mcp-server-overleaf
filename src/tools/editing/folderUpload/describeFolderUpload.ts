import { describeByteSize } from "../../web/saveDownloadedFile.js";
import type { SkippedLocalEntry } from "./readLocalFolder.js";

const LONGEST_FILE_LIST = 20;
const LONGEST_SKIPPED_LIST = 10;

export interface CopiedFile {
  readonly projectPath: string;
  readonly size: number;
  readonly replaced: boolean;
  /** How Overleaf stored an upload through the editor: "doc" for an editable document. */
  readonly storedAs?: "doc" | "file";
}

function describeCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function describeCopiedFileCount(copied: readonly CopiedFile[]): string {
  const totalBytes = copied.reduce((sum, file) => sum + file.size, 0);
  return `${describeCount(copied.length, "file", "files")} (${describeByteSize(totalBytes)})`;
}

export function describeReplacedCount(copied: readonly CopiedFile[]): string {
  const replaced = copied.filter((file) => file.replaced).length;
  if (replaced === 0) return "";
  if (replaced === copied.length)
    return copied.length === 1
      ? ", replacing the file already there"
      : ", each replacing a file already there";
  return `, ${replaced} of them replacing files already there`;
}

export function describeCopiedFiles(copied: readonly CopiedFile[]): string[] {
  const lines = copied.slice(0, LONGEST_FILE_LIST).map((file) => {
    const storedAs = file.storedAs === "doc" ? ", an editable document" : "";
    return `- ${file.projectPath} (${file.replaced ? "replaced" : "added"}, ${describeByteSize(file.size)}${storedAs})`;
  });
  if (copied.length > LONGEST_FILE_LIST) lines.push(`- and ${copied.length - LONGEST_FILE_LIST} more`);
  return lines;
}

export function describeSkippedEntries(skipped: readonly SkippedLocalEntry[]): string[] {
  if (skipped.length === 0) return [];
  const named = skipped
    .slice(0, LONGEST_SKIPPED_LIST)
    .map((entry) => `${entry.relativePath} (${entry.reason})`)
    .join(", ");
  const more =
    skipped.length > LONGEST_SKIPPED_LIST ? ` and ${skipped.length - LONGEST_SKIPPED_LIST} more` : "";
  return [`Left out ${describeCount(skipped.length, "entry", "entries")}: ${named}${more}.`];
}
