import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";

import { parseEnvironmentFile } from "../../../src/config/loadEnvironmentFile.js";

/**
 * The live suite reads its own OVERLEAF_E2E_* names, never the server's OVERLEAF_* ones, so a
 * developer's everyday .env can never point these writes at a real paper by accident.
 */
export interface LiveOverleafSettings {
  readonly projectId: string;
  readonly gitToken: string | undefined;
  readonly sessionCookie: string | undefined;
  readonly webBaseUrl: string;
  readonly editorDocumentPath: string;
}

function readSettingsSource(): NodeJS.ProcessEnv {
  const settingsFilePath = process.env.OVERLEAF_E2E_ENV_FILE?.trim();
  if (!settingsFilePath) return process.env;
  if (!isAbsolute(settingsFilePath)) throw new Error("OVERLEAF_E2E_ENV_FILE must be an absolute path.");
  return { ...parseEnvironmentFile(readFileSync(settingsFilePath, "utf8")), ...process.env };
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function loadLiveOverleafSettings(): LiveOverleafSettings | undefined {
  const source = readSettingsSource();
  const projectId = nonEmpty(source.OVERLEAF_E2E_PROJECT_ID);
  if (!projectId) return undefined;
  return {
    projectId,
    gitToken: nonEmpty(source.OVERLEAF_E2E_GIT_TOKEN),
    sessionCookie: nonEmpty(source.OVERLEAF_E2E_SESSION_COOKIE),
    webBaseUrl: nonEmpty(source.OVERLEAF_E2E_WEB_BASE_URL) ?? "https://www.overleaf.com",
    editorDocumentPath: nonEmpty(source.OVERLEAF_E2E_EDITOR_DOCUMENT) ?? "main.tex",
  };
}

export const liveOverleafSettings = loadLiveOverleafSettings();

export const liveGitBridgeConfigured = liveOverleafSettings?.gitToken !== undefined;
export const liveEditorConfigured = liveOverleafSettings?.sessionCookie !== undefined;

export function requireLiveOverleafSettings(): LiveOverleafSettings {
  if (!liveOverleafSettings) throw new Error("OVERLEAF_E2E_PROJECT_ID is not set.");
  return liveOverleafSettings;
}
