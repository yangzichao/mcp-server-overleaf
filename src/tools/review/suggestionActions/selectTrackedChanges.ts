import type { OverleafDocumentEntry } from "../../../overleaf/realtime/overleafProjectDocuments.js";
import type { OverleafRealtimeSession } from "../../../overleaf/realtime/overleafRealtimeSession.js";
import {
  describeLineForPosition,
  type TrackedChange,
} from "../../../overleaf/realtime/trackedChangeRanges.js";
import { truncateForModel } from "../../toolContext.js";
import { requireDocument } from "../openReviewSession.js";

/**
 * Choosing the suggestions to accept or reject, and checking afterwards that they are gone,
 * because an acknowledgement from Overleaf says the request arrived, not that the review panel
 * changed.
 */

export interface TrackedChangeSelection {
  readonly path: string;
  readonly changeIds: readonly string[] | undefined;
  readonly all: boolean | undefined;
}

export interface SelectedChanges {
  readonly document: OverleafDocumentEntry;
  readonly lines: readonly string[];
  readonly version: number;
  readonly changes: readonly TrackedChange[];
}

export async function selectTrackedChanges(
  session: OverleafRealtimeSession,
  selection: TrackedChangeSelection,
): Promise<SelectedChanges> {
  if ((selection.changeIds === undefined) === (selection.all !== true)) {
    throw new Error("Give either changeIds or all: true, so it is explicit which suggestions to decide.");
  }
  const document = requireDocument(session, selection.path);
  const joined = await session.joinDocument(document.documentId);
  if (joined.ranges.changes.length === 0)
    throw new Error(`There are no tracked changes in ${document.path}.`);
  if (selection.all)
    return { document, lines: joined.lines, version: joined.version, changes: joined.ranges.changes };

  const requested = new Set(selection.changeIds);
  const changes = joined.ranges.changes.filter((change) => requested.has(change.changeId));
  const unknown = [...requested].filter(
    (changeId) => !changes.some((change) => change.changeId === changeId),
  );
  if (unknown.length > 0) {
    throw new Error(
      `No tracked change ${unknown.join(", ")} in ${document.path}, so nothing was decided. read_review (view tracked_changes) shows the current ids; they change when a suggestion is edited.`,
    );
  }
  return { document, lines: joined.lines, version: joined.version, changes };
}

export async function confirmChangesGone(
  session: OverleafRealtimeSession,
  selected: SelectedChanges,
): Promise<void> {
  const after = await session.joinDocument(selected.document.documentId);
  const decidedIds = new Set(selected.changes.map((change) => change.changeId));
  const remaining = after.ranges.changes.filter((change) => decidedIds.has(change.changeId));
  if (remaining.length > 0) {
    throw new Error(
      `Overleaf acknowledged the request, but ${remaining.length} of the suggestions are still pending in ${selected.document.path}: ${remaining.map((change) => change.changeId).join(", ")}. Check the review panel before retrying.`,
    );
  }
}

export function describeDecidedChanges(verb: string, selected: SelectedChanges): string {
  const lines = selected.changes.map((change) => {
    const line = describeLineForPosition(selected.lines, change.position);
    const kind = change.kind === "insertion" ? "insert" : "delete";
    const text = change.text.replace(/\n/g, "\\n");
    return `- [${change.changeId}] line ${line}: ${kind} "${text.length > 200 ? `${text.slice(0, 200)}…` : text}"`;
  });
  const count = selected.changes.length;
  return truncateForModel(
    `${verb} ${count} suggestion${count === 1 ? "" : "s"} in ${selected.document.path}:\n${lines.join("\n")}`,
  );
}
