import { renameProject } from "../../../overleaf/web/projects/projectLifecycle.js";
import { checkProjectName } from "../../../overleaf/web/projects/projectNameRules.js";
import { describeAccessLevel } from "../../reading/accessLevelNames.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../toolContext.js";
import { requireOverleafWebClient } from "../requireOverleafWebClient.js";
import { findTargetProject } from "./findTargetProject.js";

/** Overleaf lets only the owner rename a project, so anyone else is refused before anything is sent. */
export async function renameProjectAction(
  context: ToolContext,
  project: string | undefined,
  name: string,
): Promise<ToolTextResult> {
  const webClient = requireOverleafWebClient(context);
  const target = await findTargetProject(context, webClient, project);
  if (target.listed && target.listed.accessLevel !== "owner") {
    throw new Error(
      `Only the owner of ${target.label} can rename it; this account ${describeAccessLevel(target.listed.accessLevel)} it.`,
    );
  }
  const newName = checkProjectName(name);
  if (target.listed?.name === newName)
    return textResult(`${target.label} already has that name; nothing changed.`);
  await renameProject(webClient, target.projectId, newName);
  return textResult(`Renamed ${target.label} to "${newName}"; its address stays ${target.address}.`);
}
