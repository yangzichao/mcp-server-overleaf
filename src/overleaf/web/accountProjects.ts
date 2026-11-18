import type { OverleafWebClient } from "./overleafWebClient.js";

/**
 * The projects in the signed-in account, and creating a new one.
 *
 * `GET /user/projects` is what `ProjectController.userProjectsJson` serves: every project the
 * account can open, minus archived and trashed ones, as `{ _id, name, accessLevel }`.
 * `POST /project/new` is `ProjectController.newProject`, which takes `projectName` and an
 * optional `template` ("example" for Overleaf's example paper, anything else for a blank one)
 * and answers with the new `project_id`.
 */

export interface AccountProject {
  readonly projectId: string;
  readonly name: string;
  /** "owner", "readAndWrite", "review" or "readOnly", as `_buildProjectList` assigns them. */
  readonly accessLevel: string;
}

export type NewProjectTemplate = "blank" | "example";

export async function fetchAccountProjects(client: OverleafWebClient): Promise<AccountProject[]> {
  const payload = (await client.getJson("/user/projects")) as { projects?: unknown } | undefined;
  const entries = Array.isArray(payload?.projects) ? payload.projects : [];
  const projects: AccountProject[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const project = entry as { _id?: unknown; id?: unknown; name?: unknown; accessLevel?: unknown };
    const projectId = typeof project._id === "string" ? project._id : project.id;
    if (typeof projectId !== "string" || typeof project.name !== "string") continue;
    projects.push({
      projectId,
      name: project.name,
      accessLevel: typeof project.accessLevel === "string" ? project.accessLevel : "unknown",
    });
  }
  return projects;
}

export async function createAccountProject(
  client: OverleafWebClient,
  projectName: string,
  template: NewProjectTemplate,
): Promise<string> {
  const answer = (await client.postJson("/project/new", {
    projectName,
    template: template === "example" ? "example" : "none",
  })) as { project_id?: unknown } | undefined;
  if (typeof answer?.project_id !== "string") {
    throw new Error("Overleaf did not say which project it created. Check the project list in Overleaf.");
  }
  return answer.project_id;
}
