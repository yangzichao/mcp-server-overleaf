import { createAccountProject } from "../../../overleaf/web/accountProjects.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../toolContext.js";
import { requireOverleafWebClient } from "../requireOverleafWebClient.js";

export type ProjectTemplate = "blank" | "example";

/** A new project in the signed-in account; nothing that already exists is touched. */
export async function createProjectAction(
  context: ToolContext,
  name: string,
  template: ProjectTemplate,
): Promise<ToolTextResult> {
  const webClient = requireOverleafWebClient(context);
  const projectId = await createAccountProject(webClient, name, template);
  return textResult(
    `Created the project "${name}" at ${webClient.baseUrl}/project/${projectId}. ` +
      "Pass that address as `project` to read, edit or push to it.",
  );
}
