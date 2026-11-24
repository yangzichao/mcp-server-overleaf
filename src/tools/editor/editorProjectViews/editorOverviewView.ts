import type { OverleafRealtimeSession } from "../../../overleaf/realtime/overleafRealtimeSession.js";
import { describeAccessLevel } from "../../reading/accessLevelNames.js";
import { describeProjectSettings } from "../../web/projectSettings/describeProjectSettings.js";
import { NO_GIT_BRIDGE_NOTE } from "../editorFileArguments.js";
import { findMainDocumentPath } from "./editorFilesView.js";

/** Where a task starts when there is no clone: what Overleaf's editor holds and what this account may do. */
export function describeEditorOverview(session: OverleafRealtimeSession): string {
  const tree = session.project;
  const documentCount = tree.documents.length;
  const uploadCount = tree.binaryFiles.length;
  return [
    `Project: "${tree.name}"`,
    `Main document: ${findMainDocumentPath(tree) ?? "not set in Overleaf's menu"}`,
    `Files: ${documentCount} editable document${documentCount === 1 ? "" : "s"} and ${uploadCount} binary upload${uploadCount === 1 ? "" : "s"}, such as figures.`,
    ...describeProjectSettings(session.details),
    `This account's access: ${describeAccessLevel(session.permissionsLevel)}.`,
    NO_GIT_BRIDGE_NOTE,
  ].join("\n");
}
