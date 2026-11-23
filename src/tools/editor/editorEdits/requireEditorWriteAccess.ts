import type { OverleafRealtimeSession } from "../../../overleaf/realtime/overleafRealtimeSession.js";

/**
 * An ordinary edit needs write access. `WebsocketController._assertClientCanApplyUpdate` lets a
 * reviewer send only tracked changes, so a reviewer is pointed at manage_tracked_changes instead.
 */
export function requireEditorWriteAccess(session: Pick<OverleafRealtimeSession, "permissionsLevel">): void {
  if (session.permissionsLevel === "readOnly") {
    throw new Error("This account has read-only access to the project, so it cannot edit it.");
  }
  if (session.permissionsLevel === "review") {
    throw new Error(
      "This account has review access to the project, which allows tracked changes but not direct edits. Use manage_tracked_changes (action suggest) instead.",
    );
  }
}
