import { requireOverleafId } from "../overleafIds.js";
import type { OverleafWebClient } from "../overleafWebClient.js";
import { RequestNotSentError } from "../overleafWebErrors.js";
import { fetchProjectSettingChoices, type ProjectSettingChoices } from "./projectSettingChoices.js";

/**
 * The settings the editor's settings panel changes: `POST /project/:id/settings`
 * (`ProjectController.updateProjectSettings`, behind `ensureUserCanWriteProjectSettings`, so edit
 * access is needed), answered with 204. `EditorController` applies the fields one after another,
 * so a change naming two settings can apply the first and then fail on the second.
 *
 * `ProjectOptionsHandler` answers an unknown compiler, TeX Live image or language with a bare
 * 500, and quietly ignores an image or language when the instance offers no list, so each is
 * checked here first: compilers against `safeCompilers` in Overleaf's default settings, images
 * and languages against the lists on the editor page.
 */

export const OVERLEAF_COMPILERS = ["pdflatex", "latex", "xelatex", "lualatex"] as const;

/** `validRootDocExtensions` in Overleaf's default settings, which it matches ignoring case. */
const ROOT_DOCUMENT_EXTENSION = /\.(tex|rtex|ltx|rnw)$/i;

export interface ProjectSettingsChange {
  readonly compiler?: string;
  /** The path is only checked for an extension Overleaf accepts; the id is what is sent. */
  readonly rootDocument?: { readonly documentId: string; readonly path: string };
  /** A language code from the editor's list, or "" to turn spell checking off. */
  readonly spellCheckLanguage?: string;
  /** An image name from the editor's list, such as "texlive-full:2025.1". */
  readonly texLiveImage?: string;
}

function checkCompiler(compiler: string): string {
  const normalised = compiler.trim().toLowerCase();
  if (!(OVERLEAF_COMPILERS as readonly string[]).includes(normalised)) {
    throw new RequestNotSentError(
      `Overleaf compiles with ${OVERLEAF_COMPILERS.join(", ")}, not "${compiler}".`,
    );
  }
  return normalised;
}

function checkRootDocument(rootDocument: { documentId: string; path: string }): string {
  if (!ROOT_DOCUMENT_EXTENSION.test(rootDocument.path)) {
    throw new RequestNotSentError(
      `${rootDocument.path} cannot be the main document: Overleaf accepts .tex, .Rtex, .ltx and .Rnw files.`,
    );
  }
  return requireOverleafId(rootDocument.documentId, "Document id");
}

function checkSpellCheckLanguage(code: string, choices: ProjectSettingChoices): string {
  if (code === "") return code;
  if (choices.spellCheckLanguages.length === 0) {
    throw new RequestNotSentError("This Overleaf instance offers no spell-check languages to choose from.");
  }
  if (!choices.spellCheckLanguages.some((language) => language.code === code)) {
    const offered = choices.spellCheckLanguages.map((language) => language.code).join(", ");
    throw new RequestNotSentError(
      `"${code}" is not a spell-check language Overleaf offers. It offers: ${offered}.`,
    );
  }
  return code;
}

function checkTexLiveImage(imageName: string, choices: ProjectSettingChoices): string {
  const allowed = choices.texLiveImages.filter((image) => image.allowed);
  if (allowed.length === 0) {
    throw new RequestNotSentError("This Overleaf instance offers no choice of TeX Live version.");
  }
  const match = allowed.find((image) => image.imageName.toLowerCase() === imageName.trim().toLowerCase());
  if (!match) {
    const offered = allowed.map((image) => `${image.imageName} (${image.description})`).join(", ");
    throw new RequestNotSentError(
      `"${imageName}" is not a TeX Live version this account can use. Offered: ${offered}.`,
    );
  }
  return match.imageName;
}

export async function updateProjectSettings(
  client: OverleafWebClient,
  projectId: string,
  change: ProjectSettingsChange,
): Promise<void> {
  const id = requireOverleafId(projectId, "Project id");
  const body: Record<string, string> = {};
  if (change.compiler !== undefined) body.compiler = checkCompiler(change.compiler);
  if (change.rootDocument !== undefined) body.rootDocId = checkRootDocument(change.rootDocument);
  if (change.spellCheckLanguage !== undefined || change.texLiveImage !== undefined) {
    const choices = await fetchProjectSettingChoices(client, id);
    if (change.spellCheckLanguage !== undefined) {
      body.spellCheckLanguage = checkSpellCheckLanguage(change.spellCheckLanguage, choices);
    }
    if (change.texLiveImage !== undefined) body.imageName = checkTexLiveImage(change.texLiveImage, choices);
  }
  if (Object.keys(body).length === 0) throw new RequestNotSentError("No setting to change was given.");
  await client.postIgnoringAnswer(`/project/${id}/settings`, body);
}
