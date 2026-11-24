import { requireOverleafId } from "../overleafIds.js";
import type { OverleafWebClient } from "../overleafWebClient.js";
import { readBooleanMetaTag, readJsonMetaTag } from "./editorPageMetaTags.js";

/**
 * What the project's settings may be set to on this Overleaf instance. The lists exist only in
 * the editor page (`GET /project/:id`, meta tags from `views/project/editor/_meta.pug`):
 * `ol-imageNames` from `ProjectHelper.getAllowedImagesForUser`, `ol-languages` from
 * `Settings.languages`, and `ol-hasTrackChangesFeature`, which says whether this Overleaf instance
 * has the track-changes module at all (`Features.hasFeature('track-changes')`); whether the
 * project's plan includes it is in the real-time project details instead.
 */

interface TexLiveImageChoice {
  /** The value the settings route takes, such as "texlive-full:2025.1". */
  readonly imageName: string;
  readonly description: string;
  /** False for an image this account may keep but not switch to, as the editor's menu treats it. */
  readonly allowed: boolean;
}

interface SpellCheckLanguageChoice {
  readonly code: string;
  readonly name: string;
}

export interface ProjectSettingChoices {
  readonly texLiveImages: readonly TexLiveImageChoice[];
  readonly spellCheckLanguages: readonly SpellCheckLanguageChoice[];
  /** Whether the instance has track changes; undefined when the page has no such tag. */
  readonly hasTrackChangesFeature: boolean | undefined;
}

function readObjects(value: unknown): Record<string, unknown>[] {
  return (Array.isArray(value) ? value : []).filter(
    (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object",
  );
}

/** Exported for tests. */
export function readProjectSettingChoices(editorPageHtml: string): ProjectSettingChoices {
  const texLiveImages = readObjects(readJsonMetaTag(editorPageHtml, "ol-imageNames")).flatMap((image) =>
    typeof image.imageName === "string"
      ? [
          {
            imageName: image.imageName,
            description: typeof image.imageDesc === "string" ? image.imageDesc : image.imageName,
            allowed: image.allowed !== false,
          },
        ]
      : [],
  );
  const spellCheckLanguages = readObjects(readJsonMetaTag(editorPageHtml, "ol-languages")).flatMap(
    (language) =>
      typeof language.code === "string"
        ? [{ code: language.code, name: typeof language.name === "string" ? language.name : language.code }]
        : [],
  );
  return {
    texLiveImages,
    spellCheckLanguages,
    hasTrackChangesFeature: readBooleanMetaTag(editorPageHtml, "ol-hasTrackChangesFeature"),
  };
}

export async function fetchProjectSettingChoices(
  client: OverleafWebClient,
  projectId: string,
): Promise<ProjectSettingChoices> {
  return readProjectSettingChoices(
    await client.getPage(`/project/${requireOverleafId(projectId, "Project id")}`),
  );
}
