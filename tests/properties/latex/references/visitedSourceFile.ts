import type { VisitedSourceFile } from "../../../../src/latex/includes/walkIncludedFiles.js";
import { scanSource } from "../../../../src/latex/source/scannedSource.js";

/** A file as the include walk hands it on, for checks that read one file at a time. */
export function visitedSourceFile(path: string, text: string, baseDirectory = ""): VisitedSourceFile {
  return { ...scanSource(path, text), baseDirectory, includes: [] };
}
