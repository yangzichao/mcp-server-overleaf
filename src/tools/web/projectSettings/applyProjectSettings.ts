import {
  everyKnownUserId,
  type OverleafProjectDetails,
} from "../../../overleaf/realtime/overleafProjectDetails.js";
import type { OverleafRealtimeSession } from "../../../overleaf/realtime/overleafRealtimeSession.js";
import type { OverleafWebClient } from "../../../overleaf/web/overleafWebClient.js";
import { RequestNotSentError } from "../../../overleaf/web/overleafWebErrors.js";
import {
  type ProjectSettingsChange,
  updateProjectSettings,
} from "../../../overleaf/web/projects/projectSettings.js";
import { setTrackChangesForEveryone } from "../../../overleaf/web/projects/trackChangesSwitch.js";
import { describeAccessLevel } from "../../reading/accessLevelNames.js";
import { requireDocument } from "../../review/openReviewSession.js";
import { confirmProjectSettings } from "./confirmProjectSettings.js";
import type { RequestedProjectSettings } from "./requestedProjectSettings.js";

/**
 * Sends a settings change after every check that can be made first, so a change that cannot work
 * is refused with nothing sent. Overleaf applies the menu settings one after another and the
 * track-changes switch separately, so a refusal after that may leave part of the change in
 * place; it is returned rather than thrown, for the caller to read the project again and say
 * what took. When the project already has every requested setting, nothing is sent.
 */

export interface SentProjectSettings {
  readonly projectName: string;
  /** The main document as the project names it, when rootDocument was asked for. */
  readonly rootDocumentPath: string | undefined;
  /** Everyone the track-changes switch named. */
  readonly namedUserIds: readonly string[];
  /** Why Overleaf refused part of the change after something was sent. */
  readonly failure: Error | undefined;
  /** Every requested setting, when the project already had all of them and nothing was sent. */
  readonly alreadyInEffect: readonly string[] | undefined;
}

const EDIT_ACCESS_LEVELS = new Set(["owner", "readAndWrite", "readWrite"]);

function requireSettingsAccess(session: OverleafRealtimeSession): void {
  if (EDIT_ACCESS_LEVELS.has(session.permissionsLevel)) return;
  throw new Error(
    `This account ${describeAccessLevel(session.permissionsLevel)} "${session.project.name}", and changing its settings needs edit access. ` +
      "Ask the owner to change them, or to raise this account's access.",
  );
}

function requireTrackChangesSwitch(details: OverleafProjectDetails): void {
  if (!details.trackChangesAvailable) {
    throw new RequestNotSentError(
      "Track changes is not part of the project owner's Overleaf plan, so there is no switch to turn. Nothing was changed.",
    );
  }
  if (everyKnownUserId(details).length === 0) {
    throw new RequestNotSentError(
      "Overleaf did not say who is in the project, so track changes cannot be switched for everyone. Nothing was changed.",
    );
  }
}

function menuSettingsChange(
  requested: RequestedProjectSettings,
  rootDocument: { documentId: string; path: string } | undefined,
): ProjectSettingsChange | undefined {
  const change: { -readonly [Key in keyof ProjectSettingsChange]: ProjectSettingsChange[Key] } = {};
  if (requested.compiler !== undefined) change.compiler = requested.compiler;
  if (rootDocument !== undefined) change.rootDocument = rootDocument;
  if (requested.spellCheckLanguage !== undefined) change.spellCheckLanguage = requested.spellCheckLanguage;
  if (requested.texLiveImage !== undefined) change.texLiveImage = requested.texLiveImage;
  return Object.keys(change).length > 0 ? change : undefined;
}

export async function applyProjectSettings(
  webClient: OverleafWebClient,
  session: OverleafRealtimeSession,
  requested: RequestedProjectSettings,
): Promise<SentProjectSettings> {
  requireSettingsAccess(session);
  const rootDocument =
    requested.rootDocument === undefined ? undefined : requireDocument(session, requested.rootDocument);
  if (requested.trackChanges !== undefined) requireTrackChangesSwitch(session.details);
  const projectId = session.project.projectId;
  const sent = {
    projectName: session.project.name,
    rootDocumentPath: rootDocument?.path,
    namedUserIds: requested.trackChanges === undefined ? [] : everyKnownUserId(session.details),
  };
  const before = confirmProjectSettings(session, requested, {
    ...sent,
    failure: undefined,
    alreadyInEffect: undefined,
  });
  if (before.notInEffect.length === 0) {
    return { ...sent, failure: undefined, alreadyInEffect: before.inEffect };
  }
  let anythingSent = false;
  try {
    const change = menuSettingsChange(
      requested,
      rootDocument && { documentId: rootDocument.documentId, path: rootDocument.path },
    );
    if (change) {
      await updateProjectSettings(webClient, projectId, change).catch((error: unknown) => {
        if (!(error instanceof RequestNotSentError)) anythingSent = true;
        throw error;
      });
      anythingSent = true;
    }
    if (requested.trackChanges !== undefined) {
      await setTrackChangesForEveryone(webClient, projectId, requested.trackChanges, session.details);
    }
    return { ...sent, failure: undefined, alreadyInEffect: undefined };
  } catch (error) {
    if (!anythingSent && error instanceof RequestNotSentError) throw error;
    return {
      ...sent,
      failure: error instanceof Error ? error : new Error(String(error)),
      alreadyInEffect: undefined,
    };
  }
}
