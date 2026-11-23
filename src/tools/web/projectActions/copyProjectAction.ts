import { copyProject } from "../../../overleaf/web/projects/projectLifecycle.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../toolContext.js";
import { requireOverleafWebClient } from "../requireOverleafWebClient.js";
import { findTargetProject } from "./findTargetProject.js";

/** A copy owned by this account, as the project list's Copy makes one; the original is untouched. */
export async function copyProjectAction(
  context: ToolContext,
  project: string | undefined,
  name: string,
): Promise<ToolTextResult> {
  const webClient = requireOverleafWebClient(context);
  const target = await findTargetProject(context, webClient, project);
  const copy = await copyProject(webClient, target.projectId, name);
  return textResult(
    `Copied ${target.label} to a new project "${copy.name}" at ${webClient.baseUrl}/project/${copy.projectId}, owned by this account; the original is unchanged. ` +
      "Pass that address as `project` to read, edit or push to it.",
  );
}
