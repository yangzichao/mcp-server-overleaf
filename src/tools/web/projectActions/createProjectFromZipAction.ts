import { basename } from "node:path";

import { createProjectFromZip } from "../../../overleaf/web/projects/projectFromZip.js";
import { readLocalUpload } from "../../editing/readLocalUpload.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../toolContext.js";
import { requireOverleafWebClient } from "../requireOverleafWebClient.js";

/**
 * A new project from a ZIP file on this computer, as the project list's "Upload project" makes
 * one. The file is read with the same limits as an upload to a project: an absolute path, nothing
 * hidden, at most 50 MB.
 */
export async function createProjectFromZipAction(
  context: ToolContext,
  sourcePath: string,
  name: string | undefined,
): Promise<ToolTextResult> {
  const webClient = requireOverleafWebClient(context);
  const zipBytes = await readLocalUpload(sourcePath);
  const projectName = (name ?? basename(sourcePath).replace(/\.zip$/i, "")).trim();
  const projectId = await createProjectFromZip(webClient, projectName, zipBytes);
  return textResult(
    `Created the project "${projectName}" from ${sourcePath} at ${webClient.baseUrl}/project/${projectId}. ` +
      "Pass that address as `project` to read, edit or push to it.",
  );
}
