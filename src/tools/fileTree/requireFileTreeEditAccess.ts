import type { OverleafRealtimeSession } from "../../overleaf/realtime/overleafRealtimeSession.js";
import { describeAccessLevel } from "../reading/accessLevelNames.js";

/**
 * The file-tree routes in `EditorRouter.mjs` and the upload route need edit access. A reviewer
 * may suggest and comment but not change files, so that is refused before anything is sent.
 */
export function requireFileTreeEditAccess(session: Pick<OverleafRealtimeSession, "permissionsLevel">): void {
  if (session.permissionsLevel === "owner" || session.permissionsLevel === "readAndWrite") return;
  throw new Error(
    `This account's access to the project is "${describeAccessLevel(session.permissionsLevel)}", and Overleaf needs edit access to change its files and folders. Nothing was changed.`,
  );
}
