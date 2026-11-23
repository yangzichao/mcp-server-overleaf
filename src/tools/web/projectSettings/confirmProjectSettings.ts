import type { OverleafTrackChangesState } from "../../../overleaf/realtime/overleafProjectDetails.js";
import type { OverleafRealtimeSession } from "../../../overleaf/realtime/overleafRealtimeSession.js";
import { findMainDocumentPath } from "../../editor/editorProjectViews/editorFilesView.js";
import type { SentProjectSettings } from "./applyProjectSettings.js";
import { describeTrackChangesState } from "./describeProjectSettings.js";
import {
  describeSpellCheckChoice,
  describeTrackChangesChoice,
  type RequestedProjectSettings,
} from "./requestedProjectSettings.js";

/**
 * Compares what a call asked for with what a fresh editor connection reports, setting by
 * setting, since Overleaf answers a settings change without saying what it stored.
 */

export interface SettingsConfirmation {
  /** Each requested setting the project now has, such as "compiler xelatex". */
  readonly inEffect: string[];
  /** Each one it does not, with what the project reports instead. */
  readonly notInEffect: string[];
}

interface SettingCheck {
  readonly wanted: string;
  readonly holds: boolean;
  readonly reported: string;
}

function sameText(reported: string | undefined, wanted: string): boolean {
  return reported?.trim().toLowerCase() === wanted.trim().toLowerCase();
}

function trackChangesHolds(
  state: OverleafTrackChangesState,
  on: boolean,
  namedUserIds: readonly string[],
): boolean {
  if (on) {
    return (
      state.onForEveryone ||
      (namedUserIds.every((userId) => state.onForUserIds.includes(userId)) && state.onForGuests)
    );
  }
  return !state.onForEveryone && state.onForUserIds.length === 0 && !state.onForGuests;
}

function settingChecks(
  fresh: OverleafRealtimeSession,
  requested: RequestedProjectSettings,
  sent: SentProjectSettings,
): SettingCheck[] {
  const details = fresh.details;
  const checks: SettingCheck[] = [];
  if (requested.compiler !== undefined) {
    checks.push({
      wanted: `compiler ${requested.compiler}`,
      holds: sameText(details.compiler, requested.compiler),
      reported: details.compiler ?? "none reported",
    });
  }
  if (requested.texLiveImage !== undefined) {
    checks.push({
      wanted: `TeX Live image ${requested.texLiveImage}`,
      holds: sameText(details.texLiveImage, requested.texLiveImage),
      reported: details.texLiveImage ?? "none reported",
    });
  }
  if (sent.rootDocumentPath !== undefined) {
    const mainDocument = findMainDocumentPath(fresh.project);
    checks.push({
      wanted: `main document ${sent.rootDocumentPath}`,
      holds: mainDocument === sent.rootDocumentPath,
      reported: mainDocument ?? "none set",
    });
  }
  if (requested.spellCheckLanguage !== undefined) {
    checks.push({
      wanted: describeSpellCheckChoice(requested.spellCheckLanguage),
      holds: (details.spellCheckLanguage ?? "") === requested.spellCheckLanguage,
      reported: details.spellCheckLanguage ?? "off",
    });
  }
  if (requested.trackChanges !== undefined) {
    checks.push({
      wanted: describeTrackChangesChoice(requested.trackChanges),
      holds: trackChangesHolds(details.trackChanges, requested.trackChanges, sent.namedUserIds),
      reported: describeTrackChangesState(details),
    });
  }
  return checks;
}

export function confirmProjectSettings(
  fresh: OverleafRealtimeSession,
  requested: RequestedProjectSettings,
  sent: SentProjectSettings,
): SettingsConfirmation {
  const checks = settingChecks(fresh, requested, sent);
  return {
    inEffect: checks.filter((check) => check.holds).map((check) => check.wanted),
    notInEffect: checks
      .filter((check) => !check.holds)
      .map((check) => `${check.wanted} (the project reports ${check.reported})`),
  };
}

export function describeSettingsConfirmation(confirmation: SettingsConfirmation): string {
  return [
    confirmation.inEffect.length > 0 ? `In effect now: ${confirmation.inEffect.join(", ")}.` : "",
    confirmation.notInEffect.length > 0 ? `Not in effect: ${confirmation.notInEffect.join("; ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
