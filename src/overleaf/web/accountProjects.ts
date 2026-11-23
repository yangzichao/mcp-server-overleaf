import type { OverleafWebClient } from "./overleafWebClient.js";
import { fetchTags } from "./projects/projectTags.js";

/**
 * The projects in the signed-in account, and creating a new one.
 *
 * `GET /user/projects` is what `ProjectController.userProjectsJson` serves: every project the
 * account can open, minus archived and trashed ones, as `{ _id, name, accessLevel }`. Archived
 * and trashed projects come only from the project list's own `POST /api/project`
 * (`ProjectListController.getProjectsJson`), which with no filter answers with every project
 * and flags each `archived` and `trashed`; a project that is both counts as archived only.
 * Neither route names a project's tags, so those are joined in from `GET /tag`.
 * `POST /project/new` is `ProjectController.newProject`, which takes `projectName` and an
 * optional `template` ("example" for Overleaf's example paper, anything else for a blank one)
 * and answers with the new `project_id`.
 */

export interface AccountProject {
  readonly projectId: string;
  readonly name: string;
  /** "owner", "readAndWrite", "review" or "readOnly", as `_buildProjectList` assigns them. */
  readonly accessLevel: string;
  readonly archived: boolean;
  readonly trashed: boolean;
  /** Names of this account's tags on the project; empty unless `includeTags` was asked for. */
  readonly tags: readonly string[];
}

export interface AccountProjectListOptions {
  readonly includeArchived?: boolean;
  readonly includeTrashed?: boolean;
  readonly includeTags?: boolean;
}

export type NewProjectTemplate = "blank" | "example";

interface ListedProject {
  readonly projectId: string;
  readonly name: string;
  readonly accessLevel: string;
  readonly archived: boolean;
  readonly trashed: boolean;
}

function readListedProjects(entries: unknown): ListedProject[] {
  const projects: ListedProject[] = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || typeof entry !== "object") continue;
    const project = entry as {
      _id?: unknown;
      id?: unknown;
      name?: unknown;
      accessLevel?: unknown;
      archived?: unknown;
      trashed?: unknown;
    };
    const projectId = typeof project._id === "string" ? project._id : project.id;
    if (typeof projectId !== "string" || typeof project.name !== "string") continue;
    projects.push({
      projectId,
      name: project.name,
      accessLevel: typeof project.accessLevel === "string" ? project.accessLevel : "unknown",
      archived: project.archived === true,
      trashed: project.trashed === true,
    });
  }
  return projects;
}

async function fetchListedProjects(
  client: OverleafWebClient,
  options: AccountProjectListOptions,
): Promise<ListedProject[]> {
  if (!options.includeArchived && !options.includeTrashed) {
    const payload = (await client.getJson("/user/projects")) as { projects?: unknown } | undefined;
    return readListedProjects(payload?.projects);
  }
  const payload = (await client.postJson("/api/project", { sort: { by: "title", order: "asc" } })) as
    | { projects?: unknown }
    | undefined;
  return readListedProjects(payload?.projects).filter(
    (project) =>
      (options.includeArchived || !project.archived) && (options.includeTrashed || !project.trashed),
  );
}

export async function fetchAccountProjects(
  client: OverleafWebClient,
  options: AccountProjectListOptions = {},
): Promise<AccountProject[]> {
  const [projects, tags] = await Promise.all([
    fetchListedProjects(client, options),
    options.includeTags ? fetchTags(client) : Promise.resolve([]),
  ]);
  return projects.map((project) => ({
    ...project,
    tags: tags.filter((tag) => tag.projectIds.includes(project.projectId)).map((tag) => tag.name),
  }));
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
