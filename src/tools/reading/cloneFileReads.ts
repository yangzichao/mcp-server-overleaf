import { resolve } from "node:path";

import { prepareImageForModel } from "../../images/prepareImageForModel.js";
import { BinaryFileError, type OverleafGitRepository } from "../../overleaf/overleafGitRepository.js";
import { requireSynchronizedWithOverleaf } from "../../workflow/synchronizeWithOverleaf.js";
import { createProjectSourceReader } from "../latex/projectSourceReader.js";
import { type ToolContext, type ToolTextResult, textResult } from "../toolContext.js";
import { describeUnreadableBinaryFile, imageToolResult, isImageFilePath } from "./images/imageFiles.js";
import { readFileWithIncludes } from "./includes/readFileWithIncludes.js";
import { presentFileText } from "./presentFileText.js";

/** One read_file call on the clone, its arguments already checked against each other. */
export interface CloneFileRead {
  readonly path: string;
  readonly startLine?: number | undefined;
  readonly endLine?: number | undefined;
  readonly sectionTitle?: string | undefined;
  readonly mode?: "full" | "smart" | undefined;
  readonly previousRevision?: string | undefined;
  readonly revision?: string | undefined;
  readonly followIncludes?: boolean | undefined;
}

/** Text as it is now; a binary file that is not an image is refused with what to do instead. */
async function readTextOrExplain(repository: OverleafGitRepository, path: string): Promise<string> {
  try {
    return await repository.readTextFile(path);
  } catch (error) {
    if (error instanceof BinaryFileError) throw new Error(describeUnreadableBinaryFile(path));
    throw error;
  }
}

async function readTextFromClone(
  context: ToolContext,
  repository: OverleafGitRepository,
  read: CloneFileRead,
): Promise<ToolTextResult> {
  const content = read.revision
    ? await repository.history().readTextAt(read.revision, read.path)
    : await readTextOrExplain(repository, read.path);
  if (read.mode) {
    const scope = resolve(repository.repositoryDirectory, read.path);
    return textResult(JSON.stringify(context.fileRevisions.read(scope, content, read.previousRevision)));
  }
  const { sectionTitle, startLine, endLine } = read;
  return textResult(presentFileText(read.path, content, { sectionTitle, startLine, endLine }));
}

/** Pulls first, then returns the file flattened, as an image, or as text. */
export async function readFromClone(
  context: ToolContext,
  repository: OverleafGitRepository,
  read: CloneFileRead,
): Promise<ToolTextResult> {
  await requireSynchronizedWithOverleaf(repository);
  if (read.followIncludes) {
    return textResult(await readFileWithIncludes(await createProjectSourceReader(repository), read.path));
  }
  if (isImageFilePath(read.path)) {
    return imageToolResult(
      read.path,
      prepareImageForModel(await repository.readFileBytes(read.path), read.path),
    );
  }
  return readTextFromClone(context, repository, read);
}
