import { withReviewSession } from "../../review/openReviewSession.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../toolContext.js";
import { applyProjectSettings } from "../projectSettings/applyProjectSettings.js";
import {
  confirmProjectSettings,
  describeSettingsConfirmation,
  type SettingsConfirmation,
} from "../projectSettings/confirmProjectSettings.js";
import {
  type RequestedProjectSettings,
  requireSomeSetting,
} from "../projectSettings/requestedProjectSettings.js";
import { requireOverleafWebClient } from "../requireOverleafWebClient.js";

/**
 * Changes the settings of the editor's menu, then opens a fresh connection to the project and
 * checks each one, because Overleaf answers without saying what it stored and the track-changes
 * switch follows only what the open-source editor sends. Anything not in effect is reported as
 * a failure, together with what did take.
 */
export async function updateSettingsAction(
  context: ToolContext,
  project: string | undefined,
  requested: RequestedProjectSettings,
): Promise<ToolTextResult> {
  requireSomeSetting(requested);
  const webClient = requireOverleafWebClient(context);
  const sent = await withReviewSession(context, project, (session) =>
    applyProjectSettings(webClient, session, requested),
  );
  const label = `"${sent.projectName}"`;
  if (sent.alreadyInEffect) {
    return textResult(`${label} already has ${sent.alreadyInEffect.join(", ")}; nothing changed.`);
  }
  const confirmation: SettingsConfirmation | Error = await withReviewSession(context, project, (fresh) =>
    Promise.resolve(confirmProjectSettings(fresh, requested, sent)),
  ).catch((error: unknown) => (error instanceof Error ? error : new Error(String(error))));

  const outcome =
    confirmation instanceof Error
      ? `The project could not be read again to check the change: ${confirmation.message}`
      : describeSettingsConfirmation(confirmation);
  if (sent.failure) {
    throw new Error(
      `Overleaf refused part of the settings change to ${label}: ${sent.failure.message} ${outcome}`,
    );
  }
  if (confirmation instanceof Error || confirmation.notInEffect.length > 0) {
    throw new Error(
      `Overleaf accepted the settings change to ${label}, but a fresh connection to the project does not show all of it. ${outcome} Check the project's settings menu in Overleaf.`,
    );
  }
  return textResult(
    `Changed the settings of ${label}: ${confirmation.inEffect.join(", ")}. A fresh connection to the project confirms each change.`,
  );
}
