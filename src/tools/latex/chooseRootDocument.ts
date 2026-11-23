import * as z from "zod/v4";

import { containsDocumentEnvironment, guessMainTexFile } from "../../latex/latexProjectFiles.js";
import type { OverleafGitRepository } from "../../overleaf/overleafGitRepository.js";

export const mainTexFileArgument = z
  .string()
  .optional()
  .describe(
    "Root document to start from, as a path in the project, e.g. main.tex. Omit to use the likely main document, the same guess read_project makes.",
  );

export interface ChosenRootDocument {
  readonly path: string;
  /** Set when the guessed file has no document environment, so it may be a fragment. */
  readonly warning: string | undefined;
}

/**
 * The named root document, or the guessed one; an error names the .tex files that exist.
 * argumentName is the parameter the caller's tool takes to choose a different root.
 */
export async function chooseRootDocument(
  repository: OverleafGitRepository,
  projectFiles: ReadonlySet<string>,
  requested: string | undefined,
  argumentName = "mainTexFile",
): Promise<ChosenRootDocument> {
  const texFiles = [...projectFiles].filter((path) => /\.(tex|ltx)$/i.test(path)).sort();
  if (requested !== undefined) {
    if (projectFiles.has(requested)) return { path: requested, warning: undefined };
    throw new Error(`No file at "${requested}". The .tex files are: ${texFiles.join(", ") || "none"}.`);
  }
  const guessed = guessMainTexFile(texFiles);
  if (guessed === null) throw new Error("The project has no .tex file to start from.");
  const warning = containsDocumentEnvironment(await repository.readTextFile(guessed))
    ? undefined
    : `${guessed} has no \\begin{document}, so it may not be the main document; pass ${argumentName} to choose another.`;
  return { path: guessed, warning };
}
