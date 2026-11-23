import { formatCompileReport } from "../../latex/formatCompileReport.js";
import { containsDocumentEnvironment, guessMainTexFile } from "../../latex/latexProjectFiles.js";
import { compileLatexProject } from "../../workflow/compileLatexProject.js";
import {
  buildDirectoryForProject,
  type ToolContext,
  type ToolTextResult,
  textResult,
  truncateForModel,
} from "../toolContext.js";
import { compiledPdfPath, findCompiledPdf, readPdfModificationTime } from "./findCompiledPdf.js";

/** latexmk on the clone as it stands, local edits included, without pulling first. */
export function compileLocally(
  context: ToolContext,
  project: string | undefined,
  mainTexFile: string | undefined,
): Promise<ToolTextResult> {
  return context.projectRegistry.withRepository(project, async (repository) => {
    let resolvedMainTexFile = mainTexFile;
    if (!resolvedMainTexFile) {
      const guessed = guessMainTexFile(await repository.listTrackedFiles());
      if (!guessed) return textResult("No .tex file found in the project, so there is nothing to compile.");
      resolvedMainTexFile = guessed;
    }

    const mainFileContent = await repository.readTextFile(resolvedMainTexFile);
    if (!containsDocumentEnvironment(mainFileContent)) {
      return textResult(
        `${resolvedMainTexFile} has no \\begin{document}, so it is an included fragment rather than the root document. ` +
          "Pass mainTexFile explicitly.",
      );
    }

    await repository.materializeAllFiles();
    const buildDirectory = buildDirectoryForProject(context.configuration, repository.repositoryDirectory);
    const expectedPdfPath = compiledPdfPath(buildDirectory, resolvedMainTexFile);
    const modifiedAtMsBeforeCompile = await readPdfModificationTime(expectedPdfPath);
    const result = await compileLatexProject({
      repositoryDirectory: repository.repositoryDirectory,
      buildDirectory,
      mainTexFile: resolvedMainTexFile,
      timeoutMs: context.configuration.compileTimeoutMs,
    });
    const pdfPath = await findCompiledPdf({
      pdfPath: expectedPdfPath,
      modifiedAtMsBeforeCompile,
      succeeded: result.succeeded,
    });
    const report = truncateForModel(formatCompileReport(result));
    return textResult(pdfPath ? `${report}\n\nThe PDF is at ${pdfPath}.` : report);
  });
}
