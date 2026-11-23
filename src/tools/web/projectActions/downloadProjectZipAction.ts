import { downloadProjectArchive } from "../../../overleaf/web/projectArchive.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../toolContext.js";
import { requireOverleafWebClient } from "../requireOverleafWebClient.js";
import { describeByteSize, saveDownloadedFile, ZIP_DOWNLOAD } from "../saveDownloadedFile.js";

/** The whole project as Overleaf holds it now, as the editor's Download Source menu gives it. */
export async function downloadProjectZipAction(
  context: ToolContext,
  project: string | undefined,
  saveTo: string,
): Promise<ToolTextResult> {
  const webClient = requireOverleafWebClient(context);
  const { overleafProjectId } = context.projectRegistry.resolveEditorProject(project);
  const bytes = await downloadProjectArchive(webClient, overleafProjectId);
  const savedPath = await saveDownloadedFile(saveTo, bytes, ZIP_DOWNLOAD);
  return textResult(`Saved the project archive (${describeByteSize(bytes.length)}) to ${savedPath}.`);
}
