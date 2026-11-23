import { fetchAccountProjects } from "../../overleaf/web/accountProjects.js";
import type { OverleafWebClient } from "../../overleaf/web/overleafWebClient.js";
import type { ToolContext } from "../toolContext.js";
import { describeAccessLevel } from "./accessLevelNames.js";

/** The account's projects as Overleaf's dashboard lists them, one line each. */
export async function describeAccountProjects(
  context: ToolContext,
  webClient: OverleafWebClient,
  nameContains: string | undefined,
): Promise<string> {
  const filter = nameContains?.trim().toLowerCase();
  const projects = (await fetchAccountProjects(webClient)).filter(
    (project) => !filter || project.name.toLowerCase().includes(filter),
  );
  if (projects.length === 0) {
    return filter
      ? `No project in the account has "${nameContains}" in its name.`
      : "The account has no projects.";
  }
  const registeredNames = new Map(
    context.configuration.registeredProjects.map((project) => [
      project.overleafProjectId,
      project.projectName,
    ]),
  );
  const lines = projects.map((project) => {
    const access = describeAccessLevel(project.accessLevel);
    const registered = registeredNames.get(project.projectId);
    const registeredNote = registered ? ` (registered here as ${registered})` : "";
    return `- ${project.name} — ${access} — ${webClient.baseUrl}/project/${project.projectId}${registeredNote}`;
  });
  const count = projects.length;
  return `${count} project${count === 1 ? "" : "s"} in the account:\n${lines.join("\n")}`;
}
