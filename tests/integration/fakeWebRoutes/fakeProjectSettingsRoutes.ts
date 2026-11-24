import type { FakeOverleafRealtime } from "../fakeOverleafRealtime.js";
import {
  type FakeAnswer,
  FORBIDDEN,
  jsonAnswer,
  NO_CONTENT,
  NOT_FOUND,
  plainTextAnswer,
} from "../fakeWebAnswers.js";
import type { FakeProjectAccess } from "./fakeProjectAccess.js";
import { type FakeWebRequest, type FakeWebRoutes, matchPath, readJsonBody } from "./fakeWebRequest.js";

/**
 * The editor page's setting lists, `POST /project/:id/settings`, the track-changes switch and the
 * word count. Unknown compilers, images and languages fail with a bare 500, as
 * `ProjectOptionsHandler` throwing does. The track-changes switch follows what the open-source
 * editor sends; its server side is not open source, so merging `on_for` into the stored map while
 * keeping `__guests__` is this fake's assumption.
 */

const FAKE_TEX_LIVE_IMAGES = [
  { imageName: "texlive-full:2025.1", imageDesc: "TeX Live 2025", allowed: true },
  { imageName: "texlive-full:2024.1", imageDesc: "TeX Live 2024", allowed: true },
  { imageName: "texlive-full:2017.1", imageDesc: "TeX Live 2017 (legacy)", allowed: false },
];

const FAKE_SPELL_CHECK_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "en_GB", name: "English (British)" },
  { code: "de", name: "German" },
];

const SAFE_COMPILERS = ["xelatex", "pdflatex", "latex", "lualatex"];
const SERVER_ERROR = plainTextAnswer(500, "Internal Server Error");
const ROOT_DOCUMENT_EXTENSION = /\.(tex|rtex|ltx|rnw)$/i;

function escapeAttribute(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export class FakeProjectSettingsRoutes implements FakeWebRoutes {
  /** What CLSI's texcount reports, before `CompileController.wordCount` wraps it. */
  texcount: Record<string, unknown> = {
    encode: "utf8",
    textWords: 1204,
    headWords: 17,
    outside: 42,
    headers: 6,
    elements: 3,
    mathInline: 25,
    mathDisplay: 4,
    errors: 0,
    messages: "",
  };
  readonly wordCountQueries: URLSearchParams[] = [];
  /** Set by a test to answer the track-changes switch as accepted while changing nothing. */
  ignoreTrackChangesSwitch = false;

  constructor(
    private readonly realtime: FakeOverleafRealtime,
    private readonly access: FakeProjectAccess,
    private readonly csrfToken: () => string,
  ) {}

  route(request: FakeWebRequest): FakeAnswer | undefined {
    const projectId = this.realtime.projectId;
    if (matchPath(request, "GET", new RegExp(`^/project/${projectId}$`, "i"))) return this.editorPage();
    if (matchPath(request, "POST", new RegExp(`^/project/${projectId}/settings$`, "i"))) {
      return this.updateSettings(request);
    }
    if (matchPath(request, "POST", new RegExp(`^/project/${projectId}/track_changes$`, "i"))) {
      return this.switchTrackChanges(request);
    }
    if (matchPath(request, "GET", new RegExp(`^/project/${projectId}/wordcount$`, "i"))) {
      this.wordCountQueries.push(request.query);
      return jsonAnswer({ texcount: this.texcount });
    }
    return undefined;
  }

  private editorPage(): FakeAnswer {
    const json = (value: unknown): string => escapeAttribute(JSON.stringify(value));
    const trackChangesMeta = this.realtime.hasTrackChangesFeature
      ? '<meta name="ol-hasTrackChangesFeature" data-type="boolean" content>'
      : '<meta name="ol-hasTrackChangesFeature" data-type="boolean">';
    return {
      status: 200,
      contentType: "text/html",
      body: [
        "<!DOCTYPE html><html><head>",
        `<meta name="ol-csrfToken" content="${this.csrfToken()}">`,
        `<meta name="ol-project_id" content="${this.realtime.projectId}">`,
        `<meta name="ol-imageNames" data-type="json" content="${json(FAKE_TEX_LIVE_IMAGES)}">`,
        `<meta name="ol-languages" data-type="json" content="${json(FAKE_SPELL_CHECK_LANGUAGES)}">`,
        trackChangesMeta,
        "</head><body></body></html>",
      ].join(""),
    };
  }

  /** `ensureUserCanWriteProjectSettings`: a name change needs the owner, anything else edit access. */
  private updateSettings(request: FakeWebRequest): FakeAnswer {
    const body = readJsonBody(request);
    const projectId = this.realtime.projectId;
    if (body.name !== undefined && !this.access.isOwner(projectId)) return FORBIDDEN;
    if (Object.keys(body).some((key) => key !== "name") && !this.access.canWrite(projectId)) return FORBIDDEN;
    return (
      this.applyCompiler(body.compiler) ??
      this.applyImageName(body.imageName) ??
      this.applySpellCheckLanguage(body.spellCheckLanguage) ??
      this.applyRootDocument(body.rootDocId) ??
      NO_CONTENT
    );
  }

  private applyCompiler(compiler: unknown): FakeAnswer | undefined {
    if (typeof compiler !== "string") return undefined;
    if (!SAFE_COMPILERS.includes(compiler.toLowerCase())) return SERVER_ERROR;
    this.realtime.projectSettings.compiler = compiler.toLowerCase();
    return undefined;
  }

  private applyImageName(imageName: unknown): FakeAnswer | undefined {
    if (typeof imageName !== "string") return undefined;
    const normalised = imageName.toLowerCase();
    if (!FAKE_TEX_LIVE_IMAGES.some((image) => image.imageName === normalised)) return SERVER_ERROR;
    this.realtime.projectSettings.imageName = normalised;
    return undefined;
  }

  private applySpellCheckLanguage(code: unknown): FakeAnswer | undefined {
    if (typeof code !== "string") return undefined;
    if (code && !FAKE_SPELL_CHECK_LANGUAGES.some((language) => language.code === code)) return SERVER_ERROR;
    this.realtime.projectSettings.spellCheckLanguage = code;
    return undefined;
  }

  private applyRootDocument(documentId: unknown): FakeAnswer | undefined {
    if (typeof documentId !== "string") return undefined;
    const path = this.realtime.tree.entityPath("doc", documentId);
    if (path === undefined) return NOT_FOUND;
    if (!ROOT_DOCUMENT_EXTENSION.test(path)) return SERVER_ERROR;
    this.realtime.rootDocumentId = documentId;
    return undefined;
  }

  private switchTrackChanges(request: FakeWebRequest): FakeAnswer {
    if (!this.access.canWrite(this.realtime.projectId)) return FORBIDDEN;
    if (this.ignoreTrackChangesSwitch) return NO_CONTENT;
    const body = readJsonBody(request);
    const state = this.realtime.trackChangesState;
    if (body.on_for && typeof body.on_for === "object") {
      for (const key of Object.keys(state)) if (key !== "__guests__") delete state[key];
      for (const [userId, on] of Object.entries(body.on_for as Record<string, unknown>))
        state[userId] = on === true;
    }
    if (typeof body.on_for_guests === "boolean") state.__guests__ = body.on_for_guests;
    return NO_CONTENT;
  }
}
