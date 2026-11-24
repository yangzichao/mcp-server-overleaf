import type { OverleafProjectDetails } from "../../../overleaf/realtime/overleafProjectDetails.js";

/**
 * A project's compile and editor settings as the editor connection reports them, in the words
 * of Overleaf's settings menu. read_project's overview prints these, and manage_project's
 * update_settings compares them after a change.
 */

export function describeTrackChangesState(details: OverleafProjectDetails): string {
  if (!details.trackChangesAvailable) return "not part of the owner's plan";
  const state = details.trackChanges;
  if (state.onForEveryone) return "on for everyone";
  const ownerIsOn = details.ownerId !== undefined && state.onForUserIds.includes(details.ownerId);
  const otherCount = state.onForUserIds.length - (ownerIsOn ? 1 : 0);
  const groups = [
    ...(ownerIsOn ? ["the owner"] : []),
    ...(otherCount > 0
      ? [`${otherCount} ${ownerIsOn ? "other " : ""}user${otherCount === 1 ? "" : "s"}`]
      : []),
    ...(state.onForGuests ? ["anonymous link editors"] : []),
  ];
  return groups.length === 0 ? "off" : `on for ${groups.join(" and ")}, off for everyone else`;
}

export function describeProjectSettings(details: OverleafProjectDetails): string[] {
  return [
    `Compiler: ${details.compiler ?? "not reported"}. TeX Live image: ${details.texLiveImage ?? "not reported"}. Spell check: ${details.spellCheckLanguage ?? "off"}.`,
    `Track changes: ${describeTrackChangesState(details)}.`,
  ];
}
