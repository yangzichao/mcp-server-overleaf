import { type AccountProject, fetchAccountProjects } from "../../overleaf/web/accountProjects.js";
import type { OverleafWebClient } from "../../overleaf/web/overleafWebClient.js";
import { fetchTags } from "../../overleaf/web/projects/projectTags.js";
import type { ToolContext } from "../toolContext.js";
import { describeAccessLevel } from "./accessLevelNames.js";
import { ACCOUNT_PROJECT_FILTER_RULES, type AccountProjectFilter } from "./accountProjectFilters.js";

export interface AccountProjectQuery {
  readonly nameContains: string | undefined;
  readonly filter: AccountProjectFilter;
  /** A tag name, compared case-insensitively. */
  readonly tag: string | undefined;
}

function hasTag(project: AccountProject, tag: string): boolean {
  return project.tags.some((projectTag) => projectTag.toLowerCase() === tag.toLowerCase());
}

/** Why nothing matched, naming the account's tags when the tag asked for is not one of them. */
async function describeNoMatch(webClient: OverleafWebClient, query: AccountProjectQuery): Promise<string> {
  const { where } = ACCOUNT_PROJECT_FILTER_RULES[query.filter];
  const tagNote = query.tag ? ` with the tag "${query.tag}"` : "";
  if (query.nameContains?.trim()) {
    return `No project ${where}${tagNote} has "${query.nameContains}" in its name.`;
  }
  if (!query.tag) {
    return query.filter === "all" ? "The account has no projects." : `No project is ${where}.`;
  }
  const tags = await fetchTags(webClient);
  const tagLower = query.tag.toLowerCase();
  if (tags.some((tag) => tag.name.toLowerCase() === tagLower)) {
    return `No project ${where} has the tag "${query.tag}".`;
  }
  const tagNames = tags.map((tag) => `"${tag.name}"`).join(", ");
  return `The account has no tag named "${query.tag}". ${tagNames ? `Its tags are ${tagNames}.` : "It has no tags."}`;
}

/** The account's projects as one of Overleaf's dashboard lists shows them, one line each. */
export async function describeAccountProjects(
  context: ToolContext,
  webClient: OverleafWebClient,
  query: AccountProjectQuery,
): Promise<string> {
  const rule = ACCOUNT_PROJECT_FILTER_RULES[query.filter];
  const nameFilter = query.nameContains?.trim().toLowerCase();
  const projects = (await fetchAccountProjects(webClient, { ...rule.listOptions, includeTags: true })).filter(
    (project) =>
      rule.keeps(project) &&
      (!nameFilter || project.name.toLowerCase().includes(nameFilter)) &&
      (!query.tag || hasTag(project, query.tag)),
  );
  if (projects.length === 0) return describeNoMatch(webClient, query);
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
    const tagsNote = project.tags.length > 0 ? ` — tags: ${project.tags.join(", ")}` : "";
    return `- ${project.name} — ${access} — ${webClient.baseUrl}/project/${project.projectId}${registeredNote}${tagsNote}`;
  });
  const count = projects.length;
  const tagNote = query.tag ? ` with the tag "${query.tag}"` : "";
  return `${count} project${count === 1 ? "" : "s"} ${rule.where}${tagNote}:\n${lines.join("\n")}`;
}
