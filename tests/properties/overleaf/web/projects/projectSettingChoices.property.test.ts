import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  type ProjectSettingChoices,
  readProjectSettingChoices,
} from "../../../../../src/overleaf/web/projects/projectSettingChoices.js";
import { anyJsonField, awkwardText } from "./generatedOverleafAnswers.js";
import { escapeAsPug } from "./pugMetaTags.js";

const imageEntry = fc.record(
  {
    imageName: fc.oneof(
      fc.constantFrom("texlive-full:2025.1", "texlive-full:2024.1"),
      awkwardText,
      anyJsonField,
    ),
    imageDesc: fc.oneof(fc.constantFrom("TeX Live 2025", ""), awkwardText, anyJsonField),
    allowed: fc.oneof(fc.boolean(), anyJsonField),
  },
  { requiredKeys: [] },
);

const languageEntry = fc.record(
  {
    code: fc.oneof(fc.constantFrom("en", "fr", "pt_BR"), awkwardText, anyJsonField),
    name: fc.oneof(fc.constantFrom("English", "Français"), awkwardText, anyJsonField),
  },
  { requiredKeys: [] },
);

function listOrNot(entry: fc.Arbitrary<unknown>): fc.Arbitrary<unknown> {
  return fc.oneof(
    {
      weight: 4,
      arbitrary: fc.array(fc.oneof({ weight: 3, arbitrary: entry }, anyJsonField), { maxLength: 4 }),
    },
    { weight: 1, arbitrary: anyJsonField },
  );
}

const settingTags = fc.record({
  imageNames: fc.option(listOrNot(imageEntry), { nil: undefined }),
  languages: fc.option(listOrNot(languageEntry), { nil: undefined }),
  hasTrackChangesFeature: fc.option(fc.boolean(), { nil: undefined }),
});

type SettingTags = typeof settingTags extends fc.Arbitrary<infer Tags> ? Tags : never;

function jsonTag(name: string, value: unknown): string[] {
  if (value === undefined) return [];
  return [`<meta name="${name}" data-type="json" content="${escapeAsPug(JSON.stringify(value))}">`];
}

function renderSettingsPage(tags: SettingTags): string {
  const trackChanges =
    tags.hasTrackChangesFeature === undefined
      ? []
      : [
          `<meta name="ol-hasTrackChangesFeature" data-type="boolean"${tags.hasTrackChangesFeature ? " content" : ""}>`,
        ];
  return [
    "<head><title>Overleaf</title>",
    '<meta name="ol-project_id" content="64b000000000000000000002">',
    ...jsonTag("ol-imageNames", tags.imageNames),
    ...jsonTag("ol-languages", tags.languages),
    ...trackChanges,
    "</head>",
  ].join("\n");
}

function objectsIn(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null,
  );
}

function expectedChoices(tags: SettingTags): ProjectSettingChoices {
  return {
    texLiveImages: objectsIn(tags.imageNames).flatMap(({ imageName, imageDesc, allowed }) =>
      typeof imageName === "string"
        ? [
            {
              imageName,
              description: typeof imageDesc === "string" ? imageDesc : imageName,
              allowed: allowed !== false,
            },
          ]
        : [],
    ),
    spellCheckLanguages: objectsIn(tags.languages).flatMap(({ code, name }) =>
      typeof code === "string" ? [{ code, name: typeof name === "string" ? name : code }] : [],
    ),
    hasTrackChangesFeature: tags.hasTrackChangesFeature,
  };
}

describe("readProjectSettingChoices properties", () => {
  it("reads back each image and language the page lists, with the editor's defaults", () => {
    fc.assert(
      fc.property(settingTags, (tags) => {
        expect(readProjectSettingChoices(renderSettingsPage(tags))).toEqual(expectedChoices(tags));
      }),
    );
  });

  it("reads a tag whose content is not JSON as no choices, and never throws", () => {
    const content = fc.oneof(awkwardText, fc.string(), fc.constantFrom("[", "{}", "[1,", "null", "&quot;"));
    fc.assert(
      fc.property(content, content, (images, languages) => {
        const page =
          `<meta name="ol-imageNames" data-type="json" content="${escapeAsPug(images)}">` +
          `<meta name="ol-languages" data-type="json" content="${escapeAsPug(languages)}">`;
        const choices = readProjectSettingChoices(page);
        for (const image of choices.texLiveImages) expect(typeof image.imageName).toBe("string");
        for (const language of choices.spellCheckLanguages) expect(typeof language.code).toBe("string");
        expect(choices.hasTrackChangesFeature).toBeUndefined();
      }),
    );
  });
});
