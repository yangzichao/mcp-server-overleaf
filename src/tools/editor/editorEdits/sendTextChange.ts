import type {
  JoinedDocument,
  OverleafRealtimeSession,
} from "../../../overleaf/realtime/overleafRealtimeSession.js";
import { buildTextChangeOperations } from "../../../overleaf/realtime/textChanges/textChangeOperations.js";

/**
 * Turns a joined document's text into newText with the fewest deletions and insertions, as one
 * update. Only the passages that differ are sent, so comment anchors and suggestions elsewhere in
 * the document stay where they are. Answers false when the text is already newText.
 */
export async function sendTextChange(
  session: Pick<OverleafRealtimeSession, "applyOperations">,
  joined: JoinedDocument,
  newText: string,
  trackedChangeIdSeed?: string,
): Promise<boolean> {
  const operations = buildTextChangeOperations(joined.lines.join("\n"), newText);
  if (operations.length === 0) return false;
  await session.applyOperations(joined.documentId, joined.version, operations, trackedChangeIdSeed);
  return true;
}
