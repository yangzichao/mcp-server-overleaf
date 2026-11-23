import {
  addProjectToTag,
  createTag,
  fetchTags,
  type ProjectTag,
  removeProjectFromTag,
} from "../../../overleaf/web/projects/projectTags.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../toolContext.js";
import { requireOverleafWebClient } from "../requireOverleafWebClient.js";
import { findTargetProject } from "./findTargetProject.js";

/**
 * Tags are the folders of Overleaf's project list and belong to the signed-in account, so a tag
 * changes nothing for co-authors. Names are matched ignoring case, as list_projects matches them,
 * so "thesis" finds an existing "Thesis" instead of creating a second tag beside it.
 */

const OWN_TAGS_NOTE = "Tags are this account's own, so co-authors see no change.";

function findTag(tags: readonly ProjectTag[], name: string): ProjectTag | undefined {
  return tags.find((tag) => tag.name.toLowerCase() === name.toLowerCase());
}

function describeTagNames(tags: readonly ProjectTag[]): string {
  return tags.length === 0
    ? "It has no tags."
    : `Its tags are ${tags.map((tag) => `"${tag.name}"`).join(", ")}.`;
}

export async function tagProjectAction(
  context: ToolContext,
  project: string | undefined,
  tagName: string,
): Promise<ToolTextResult> {
  const webClient = requireOverleafWebClient(context);
  const target = await findTargetProject(context, webClient, project);
  const existing = findTag(await fetchTags(webClient), tagName);
  if (existing?.projectIds.includes(target.projectId)) {
    return textResult(`${target.label} already has the tag "${existing.name}"; nothing changed.`);
  }
  const tag = existing ?? (await createTag(webClient, tagName));
  await addProjectToTag(webClient, tag.tagId, target.projectId);
  const created = existing ? "" : ", a tag this account did not have before";
  return textResult(`Tagged ${target.label} with "${tag.name}"${created}. ${OWN_TAGS_NOTE}`);
}

export async function untagProjectAction(
  context: ToolContext,
  project: string | undefined,
  tagName: string,
): Promise<ToolTextResult> {
  const webClient = requireOverleafWebClient(context);
  const target = await findTargetProject(context, webClient, project);
  const tags = await fetchTags(webClient);
  const tag = findTag(tags, tagName);
  if (!tag) throw new Error(`This account has no tag named "${tagName}". ${describeTagNames(tags)}`);
  if (!tag.projectIds.includes(target.projectId)) {
    return textResult(`${target.label} does not have the tag "${tag.name}"; nothing changed.`);
  }
  await removeProjectFromTag(webClient, tag.tagId, target.projectId);
  return textResult(
    `Removed the tag "${tag.name}" from ${target.label}; the tag itself stays. ${OWN_TAGS_NOTE}`,
  );
}
