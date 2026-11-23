import type { ProjectSourceReader } from "../includes/walkIncludedFiles.js";
import type { BibliographyFile } from "./scanBibliographyFiles.js";

export async function readBibliographyFiles(
  reader: ProjectSourceReader,
  paths: readonly string[],
): Promise<BibliographyFile[]> {
  const files: BibliographyFile[] = [];
  for (const path of paths) files.push({ path, text: await reader.readTextFile(path) });
  return files;
}
