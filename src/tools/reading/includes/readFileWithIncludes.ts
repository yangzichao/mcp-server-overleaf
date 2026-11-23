import {
  type FlattenedLatexDocument,
  flattenLatexDocument,
} from "../../../latex/flatten/flattenLatexDocument.js";
import type { ProjectSourceReader } from "../../../latex/includes/walkIncludedFiles.js";
import { describeLocation } from "../../../latex/source/scannedSource.js";
import { withoutTrailing } from "../../../text/withoutTrailing.js";
import { truncateForModel } from "../../toolContext.js";

function describeWhatWasInlined(rootPath: string, flattened: FlattenedLatexDocument): string[] {
  const inlined = flattened.inlinedFiles;
  const notes = [
    inlined.length === 0
      ? `${rootPath} includes no other project file, so it is returned as it is.`
      : `Inlined ${inlined.length} ${inlined.length === 1 ? "file" : "files"} between "% ---- begin" and "% ---- end" comments: ${inlined.join(", ")}.`,
  ];
  for (const missing of flattened.missingIncludes) {
    notes.push(
      `Not found, left as written: ${missing.written} at ${describeLocation(missing.location)}; tried ${missing.tried.join(", ")}.`,
    );
  }
  for (const skipped of flattened.skippedIncludes) {
    notes.push(
      `Not inlined: ${skipped.written} at ${describeLocation(skipped.location)}, because ${skipped.reason}.`,
    );
  }
  const builtFromMacros = flattened.pathsBuiltFromMacros;
  if (builtFromMacros > 0) {
    notes.push(
      `${builtFromMacros} ${builtFromMacros === 1 ? "include names its file" : "includes name their files"} with macros, such as \\input{\\dir/intro}, and ${builtFromMacros === 1 ? "was" : "were"} left as written.`,
    );
  }
  return notes;
}

/**
 * A .tex file with every file it includes inlined, the way read_file (followIncludes) returns
 * it: the text first, cut off like any read, then what was inlined and every include that was
 * not, with the reason.
 */
export async function readFileWithIncludes(reader: ProjectSourceReader, path: string): Promise<string> {
  const rootPath = path.replace(/^\.?\//, "");
  const flattened = await flattenLatexDocument(reader, rootPath);
  const textWithoutTrailingNewlines = withoutTrailing(flattened.text, "\n");
  return [
    truncateForModel(textWithoutTrailingNewlines),
    "",
    ...describeWhatWasInlined(rootPath, flattened),
  ].join("\n");
}
