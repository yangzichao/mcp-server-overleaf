import type { OverleafWebClient } from "../web/overleafWebClient.js";
import type { DocumentOperation } from "./overleafRealtimeSession.js";
import type { TrackedChange } from "./trackedChangeRanges.js";

/**
 * Accepting and rejecting suggestions, done the two different ways the web editor does them.
 *
 * Accepting is a request to the web application: the text is already in its final state, so
 * all that changes is that the range stops being tracked. `ranges-context.tsx` posts the change
 * ids to `/project/:id/doc/:docId/changes/accept`.
 *
 * Rejecting has no route. The editor undoes each suggestion with an ordinary edit, which
 * `reject-changes.ts` builds: delete a suggested insertion, re-insert a suggested deletion.
 * Those edits carry the undo flag and no tracked-changes seed, so they are not themselves
 * recorded as new suggestions.
 */

export async function acceptTrackedChanges(
  client: OverleafWebClient,
  overleafProjectId: string,
  documentId: string,
  changeIds: readonly string[],
): Promise<void> {
  await client.postJson(`/project/${overleafProjectId}/doc/${documentId}/changes/accept`, {
    change_ids: changeIds,
  });
}

/**
 * The edits that undo a set of suggestions, in the order they must be sent.
 *
 * They are ordered from the end of the document backwards, for the reason `reject-changes.ts`
 * spells out: undoing an earlier change shifts every later position, and a replacement is
 * modelled as an insertion followed by a deletion at the same place, so undoing the insertion
 * first would put the restored text in the wrong place. Working backwards keeps every
 * position that has not been used yet valid.
 */
export function buildRejectionOperations(
  documentLines: readonly string[],
  changes: readonly TrackedChange[],
): DocumentOperation[] {
  const documentText = documentLines.join("\n");
  // At a shared position the insertion's text starts there and a deletion marker sits just
  // before it, so the insertion is undone first; re-inserting the deleted text first would
  // push the insertion along and leave its position stale.
  const ordered = [...changes].sort(
    (left, right) =>
      right.position - left.position ||
      (left.kind === "insertion" ? -1 : 0) - (right.kind === "insertion" ? -1 : 0),
  );
  return ordered.map((change): DocumentOperation => {
    if (change.kind === "insertion") {
      const found = documentText.slice(change.position, change.position + change.text.length);
      if (found !== change.text) {
        throw new Error(
          `Suggestion ${change.changeId} no longer matches the document, so it was not rejected. Read the tracked changes again and retry.`,
        );
      }
      return { p: change.position, d: change.text, u: true };
    }
    return { p: change.position, i: change.text, u: true };
  });
}
