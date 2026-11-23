import { requireOverleafId } from "../overleafIds.js";
import type { OverleafWebClient } from "../overleafWebClient.js";
import { RequestNotSentError } from "../overleafWebErrors.js";

/**
 * The account's project tags, the folders of Overleaf's project list (`TagsController.mjs`,
 * `TagsHandler.mjs`). Tags belong to the signed-in user, not to a project, so tagging a shared
 * project changes nothing for its other members. `GET /tag` lists them; `POST /tag` creates
 * one and, for a name the account already uses, answers with the existing tag instead;
 * `POST` and `DELETE /tag/:tagId/project/:projectId` add and remove a project, answering 204
 * even when the tag does not exist, which is why the name-based helpers look the tag up first.
 */

export interface ProjectTag {
  readonly tagId: string;
  readonly name: string;
  readonly color: string | undefined;
  readonly projectIds: readonly string[];
}

/** `MAX_TAG_LENGTH` in TagsHandler; a longer name fails there with a 500. */
const MAXIMUM_TAG_NAME_LENGTH = 50;
/** `TAG_COLOR_REGEX` in TagsController. */
const TAG_COLOR_PATTERN = /^(#[a-fA-F0-9]{6}|hsl\(\d{1,3}, 70%, 45%\))$/;

function readTag(entry: unknown): ProjectTag | undefined {
  if (!entry || typeof entry !== "object") return undefined;
  const tag = entry as { _id?: unknown; name?: unknown; color?: unknown; project_ids?: unknown };
  if (typeof tag._id !== "string" || typeof tag.name !== "string") return undefined;
  return {
    tagId: tag._id,
    name: tag.name,
    color: typeof tag.color === "string" ? tag.color : undefined,
    projectIds: (Array.isArray(tag.project_ids) ? tag.project_ids : []).filter(
      (projectId): projectId is string => typeof projectId === "string",
    ),
  };
}

function checkTagName(name: string): string {
  if (name.length === 0) throw new RequestNotSentError("A tag needs a name.");
  if (name.length > MAXIMUM_TAG_NAME_LENGTH) {
    throw new RequestNotSentError(`Tag names can be at most ${MAXIMUM_TAG_NAME_LENGTH} characters.`);
  }
  return name;
}

export async function fetchTags(client: OverleafWebClient): Promise<ProjectTag[]> {
  const payload = await client.getJson("/tag");
  return (Array.isArray(payload) ? payload : []).flatMap((entry) => readTag(entry) ?? []);
}

export async function createTag(
  client: OverleafWebClient,
  name: string,
  color?: string,
): Promise<ProjectTag> {
  const body: Record<string, string> = { name: checkTagName(name) };
  if (color !== undefined) {
    if (!TAG_COLOR_PATTERN.test(color)) {
      throw new RequestNotSentError(`Tag colours are written as #rrggbb, not "${color}".`);
    }
    body.color = color;
  }
  const tag = readTag(await client.postJson("/tag", body));
  if (!tag)
    throw new Error("Overleaf did not describe the tag it created. Check the project list in Overleaf.");
  return tag;
}

function tagProjectPath(tagId: string, projectId: string): string {
  return `/tag/${requireOverleafId(tagId, "Tag id")}/project/${requireOverleafId(projectId, "Project id")}`;
}

export async function addProjectToTag(
  client: OverleafWebClient,
  tagId: string,
  projectId: string,
): Promise<void> {
  await client.postIgnoringAnswer(tagProjectPath(tagId, projectId));
}

export async function removeProjectFromTag(
  client: OverleafWebClient,
  tagId: string,
  projectId: string,
): Promise<void> {
  await client.delete(tagProjectPath(tagId, projectId));
}

/** Creates the tag if the account has none by that name, then adds the project to it. */
export async function tagProjectByName(
  client: OverleafWebClient,
  projectId: string,
  tagName: string,
): Promise<ProjectTag> {
  const tag = await createTag(client, tagName);
  await addProjectToTag(client, tag.tagId, projectId);
  return tag;
}

export async function untagProjectByName(
  client: OverleafWebClient,
  projectId: string,
  tagName: string,
): Promise<ProjectTag> {
  const tag = (await fetchTags(client)).find((candidate) => candidate.name === tagName);
  if (!tag) throw new RequestNotSentError(`This account has no tag named "${tagName}".`);
  await removeProjectFromTag(client, tag.tagId, projectId);
  return tag;
}
