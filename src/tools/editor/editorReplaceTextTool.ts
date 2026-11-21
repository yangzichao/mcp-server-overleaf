import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { requireEditorSafeText } from "../../overleaf/realtime/editorSafeText.js";
import type { OverleafRealtimeSession } from "../../overleaf/realtime/overleafRealtimeSession.js";
import { buildReplacementOperations } from "../../overleaf/realtime/replacementOperations.js";
import { projectArgument } from "../projectArgument.js";
import { requireDocument, withReviewSession } from "../review/openReviewSession.js";
import { WRITES_TO_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult } from "../toolContext.js";
import { editorPathArgument, NO_GIT_BRIDGE_NOTE } from "./editorFileArguments.js";

/**
 * An ordinary edit needs write access. `WebsocketController._assertClientCanApplyUpdate` lets a
 * reviewer send only tracked changes, so a reviewer is pointed at suggest_edit instead.
 */
function requireWriteAccess(session: OverleafRealtimeSession): void {
  if (session.permissionsLevel === "readOnly") {
    throw new Error("This account has read-only access to the project, so it cannot edit it.");
  }
  if (session.permissionsLevel === "review") {
    throw new Error(
      "This account has review access to the project, which allows tracked changes but not direct edits. Use suggest_edit instead.",
    );
  }
}

export function registerEditorReplaceTextTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "replace_text",
    {
      title: "Replace exact text in a file",
      description:
        "Replace an exact snippet of text in a project file, directly in Overleaf. " +
        `${NO_GIT_BRIDGE_NOTE} ` +
        "The change takes effect at once: co-authors see it immediately, there is no push_changes step and no undo here, so confirm with the user first. " +
        "It arrives as ordinary text even when the project has track changes on; use suggest_edit to propose a change as a tracked change instead. " +
        "findText must match exactly, whitespace and newlines included, and occur once unless replaceAll is set; replaceWith is inserted literally. " +
        "Overleaf's editor cannot store emoji or other characters outside the Basic Multilingual Plane, so a replaceWith containing one is refused; write a LaTeX command instead. " +
        "If the snippet is missing, or occurs several times without replaceAll, nothing changes and the reply gives the count; widen findText with surrounding text to make it unique. " +
        "Returns how many occurrences were replaced.",
      inputSchema: z.object({
        project: projectArgument,
        path: editorPathArgument,
        findText: z
          .string()
          .describe(
            "Exact text to find, matched literally including whitespace and newlines. Not a regular expression.",
          ),
        replaceWith: z.string().describe("Text to put in its place. Empty string deletes the snippet."),
        replaceAll: z
          .boolean()
          .optional()
          .describe(
            "Replace every occurrence instead of requiring exactly one match (default false). Only set this when replacing all of them is intended.",
          ),
      }),
      annotations: WRITES_TO_OVERLEAF,
    },
    async ({ project, path, findText, replaceWith, replaceAll }) =>
      runToolSafely(context, () => {
        requireEditorSafeText(replaceWith, "replaceWith");
        return withReviewSession(context, project, async (session) => {
          const document = requireDocument(session, path);
          const joined = await session.joinDocument(document.documentId);
          const replacement = buildReplacementOperations(
            joined.lines.join("\n"),
            findText,
            replaceWith,
            replaceAll ?? false,
          );
          if (replacement.status === "not-found") {
            return textResult(`Text not found in ${document.path}. Nothing was changed.`);
          }
          if (replacement.status === "ambiguous") {
            return textResult(
              `Text appears ${replacement.occurrenceCount} times in ${document.path}. Nothing was changed. ` +
                "Include more surrounding context to make the match unique, or set replaceAll.",
            );
          }
          requireWriteAccess(session);
          await session.applyOperations(document.documentId, joined.version, replacement.operations);
          return textResult(
            `Replaced ${replacement.occurrenceCount} occurrence(s) in ${document.path}. It is in Overleaf now; co-authors see it already.`,
          );
        });
      }),
  );
}
