import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { RequestNotSentError } from "../../../../../src/overleaf/web/overleafWebErrors.js";
import {
  addProjectToTag,
  createTag,
  fetchTags,
  type ProjectTag,
  removeProjectFromTag,
  tagProjectByName,
  untagProjectByName,
} from "../../../../../src/overleaf/web/projects/projectTags.js";
import { anyJsonField, awkwardText, notAnOverleafId, overleafId } from "./generatedOverleafAnswers.js";
import { changesSent, recordingWebClient, type SentRequest } from "./recordingWebClient.js";

const TAG_NAMES = ["Thesis", "thesis", "Thesis ", "2026", "Été"];

const describedTag = fc.record(
  {
    _id: fc.oneof({ weight: 3, arbitrary: overleafId }, { weight: 1, arbitrary: anyJsonField }),
    name: fc.oneof(
      { weight: 3, arbitrary: fc.constantFrom(...TAG_NAMES) },
      { weight: 1, arbitrary: anyJsonField },
    ),
    color: fc.oneof(fc.constantFrom("#1a2b3c", "hsl(120, 70%, 45%)"), anyJsonField),
    project_ids: fc.oneof(
      { weight: 3, arbitrary: fc.array(fc.oneof(overleafId, anyJsonField), { maxLength: 3 }) },
      { weight: 1, arbitrary: anyJsonField },
    ),
  },
  { requiredKeys: [] },
);

const tagListAnswer = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.array(fc.oneof({ weight: 3, arbitrary: describedTag }, anyJsonField), { maxLength: 5 }),
  },
  { weight: 1, arbitrary: anyJsonField },
);

function expectedTags(answer: unknown): ProjectTag[] {
  if (!Array.isArray(answer)) return [];
  return answer.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { _id, name, color, project_ids } = entry as Record<string, unknown>;
    if (typeof _id !== "string" || typeof name !== "string") return [];
    const projectIds = Array.isArray(project_ids) ? project_ids.filter((id) => typeof id === "string") : [];
    return [{ tagId: _id, name, color: typeof color === "string" ? color : undefined, projectIds }];
  });
}

/** `TAG_COLOR_REGEX` in Overleaf's TagsController, read without a pattern: `#rrggbb` or the editor's hsl form. */
function overleafTakesColour(colour: string): boolean {
  const hexadecimal = [...colour.slice(1)].every((character) => "0123456789abcdefABCDEF".includes(character));
  if (colour.startsWith("#")) return colour.length === 7 && hexadecimal;
  const ending = ", 70%, 45%)";
  if (!colour.startsWith("hsl(") || !colour.endsWith(ending)) return false;
  const hue = colour.slice("hsl(".length, colour.length - ending.length);
  return (
    hue.length >= 1 && hue.length <= 3 && [...hue].every((character) => character >= "0" && character <= "9")
  );
}

const colour = fc
  .array(
    fc.constantFrom(
      "#",
      "1a",
      "2B",
      "3c",
      "0",
      "g",
      "hsl(",
      "120",
      "7",
      ", 70%, 45%)",
      ", 70%, 46%)",
      " ",
      "\n",
    ),
    {
      maxLength: 5,
    },
  )
  .map((pieces) => pieces.join(""));

const tagName = fc.oneof(
  fc.constantFrom(...TAG_NAMES),
  awkwardText,
  fc.constantFrom("", "x".repeat(50), "x".repeat(51), "𝔸".repeat(25), "𝔸".repeat(26)),
  fc.string({ minLength: 48, maxLength: 52 }),
);

function answerCreatedTag(tagId: string) {
  return (request: SentRequest): unknown => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    if (request.method === "POST" && request.path === "/tag") return { _id: tagId, ...body, project_ids: [] };
    return undefined;
  };
}

describe("projectTags properties", () => {
  it("lists exactly the tags Overleaf described with an id and a name, keeping only string project ids", async () => {
    await fc.assert(
      fc.asyncProperty(tagListAnswer, async (answer) => {
        const { client, sent } = recordingWebClient(() => answer);
        expect(await fetchTags(client)).toEqual(expectedTags(answer));
        expect(sent).toEqual([{ method: "GET", path: "/tag", timeoutMs: undefined }]);
      }),
    );
  });

  it("creates a tag only for a name of 1 to 50 characters and a colour Overleaf takes, and sends nothing else", async () => {
    await fc.assert(
      fc.asyncProperty(
        tagName,
        fc.option(colour, { nil: undefined }),
        overleafId,
        async (name, chosen, tagId) => {
          const { client, sent } = recordingWebClient(answerCreatedTag(tagId));
          const accepted =
            name.length >= 1 && name.length <= 50 && (chosen === undefined || overleafTakesColour(chosen));
          const created = createTag(client, name, chosen);
          if (!accepted) {
            await expect(created).rejects.toBeInstanceOf(RequestNotSentError);
            expect(sent).toEqual([]);
            return;
          }
          const body = chosen === undefined ? { name } : { name, color: chosen };
          expect(await created).toEqual({ tagId, name, color: chosen, projectIds: [] });
          expect(sent).toEqual([{ method: "POST", path: "/tag", body }]);
        },
      ),
    );
  });

  it("untags with the first tag of exactly that name, and refuses a name no tag has after only listing them", async () => {
    const tags = fc.uniqueArray(
      fc.record({ _id: overleafId, name: fc.constantFrom(...TAG_NAMES), project_ids: fc.constant([]) }),
      { selector: (tag) => tag._id, maxLength: 4 },
    );
    await fc.assert(
      fc.asyncProperty(tags, fc.constantFrom(...TAG_NAMES), overleafId, async (listed, name, projectId) => {
        const { client, sent } = recordingWebClient((request) =>
          request.method === "GET" ? listed : undefined,
        );
        const untagged = untagProjectByName(client, projectId, name);
        const first = listed.find((tag) => tag.name === name);
        if (!first) {
          await expect(untagged).rejects.toBeInstanceOf(RequestNotSentError);
          expect(changesSent(sent)).toEqual([]);
          return;
        }
        expect((await untagged).tagId).toBe(first._id);
        expect(changesSent(sent)).toEqual([
          { method: "DELETE", path: `/tag/${first._id}/project/${projectId}` },
        ]);
      }),
    );
  });

  it("refuses an id given to it that is not an Overleaf id before it changes anything", async () => {
    type Client = Parameters<typeof fetchTags>[0];
    const helpers = {
      addProjectToTag: (client: Client, tagId: string, projectId: string) =>
        addProjectToTag(client, tagId, projectId),
      removeProjectFromTag: (client: Client, tagId: string, projectId: string) =>
        removeProjectFromTag(client, tagId, projectId),
      tagProjectByName: (client: Client, _tagId: string, projectId: string) =>
        tagProjectByName(client, projectId, "Thesis"),
      untagProjectByName: (client: Client, _tagId: string, projectId: string) =>
        untagProjectByName(client, projectId, "Thesis"),
    };
    const byTagId = fc.constantFrom("addProjectToTag" as const, "removeProjectFromTag" as const);
    const calls = fc.oneof(
      fc.tuple(byTagId, notAnOverleafId, overleafId),
      fc.tuple(
        fc.constantFrom(...(Object.keys(helpers) as (keyof typeof helpers)[])),
        overleafId,
        notAnOverleafId,
      ),
    );
    await fc.assert(
      fc.asyncProperty(calls, async ([helperName, tagId, projectId]) => {
        const listed = [{ _id: tagId, name: "Thesis", project_ids: [] }];
        const created = answerCreatedTag(tagId);
        const { client, sent } = recordingWebClient((request) =>
          request.method === "GET" ? listed : created(request),
        );
        await expect(helpers[helperName](client, tagId, projectId)).rejects.toBeInstanceOf(
          RequestNotSentError,
        );
        expect(changesSent(sent)).toEqual([]);
      }),
    );
  });
});
