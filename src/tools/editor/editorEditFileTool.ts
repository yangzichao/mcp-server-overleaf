import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { requireEditorSafeText } from "../../overleaf/realtime/editorSafeText.js";
import type { OverleafRealtimeSession } from "../../overleaf/realtime/overleafRealtimeSession.js";
import { buildReplacementOperations } from "../../overleaf/realtime/replacementOperations.js";
import { requireArgument, runSelectedOperation, type ToolOperation } from "../actions/toolOperations.js";
import { projectArgument } from "../projectArgument.js";
import { requireDocument, withReviewSession } from "../review/openReviewSession.js";
import { WRITES_TO_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, type ToolTextResult, textResult } from "../toolContext.js";
import { editorPathArgument, NO_GIT_BRIDGE_NOTE } from "./editorFileArguments.js";

const EDITOR_EDIT_ACTIONS = ["replace_text"] as const;

const editorEditFileInput = z.object({
  project: projectArgument,
  action: z
    .enum(EDITOR_EDIT_ACTIONS)
    .describe("How to edit: replace_text (an exact snippet), the one action in this setup."),
  path: editorPathArgument,
  findText: z
    .string()
    .optional()
    .describe(
      "replace_text, required: exact text to find, matched literally including whitespace and newlines. Not a regular expression.",
    ),
  replaceWith: z
    .string()
    .optional()
    .describe("replace_text, required: text to put in its place. An empty string deletes the snippet."),
  replaceAll: z
    .boolean()
    .optional()
    .describe(
      "replace_text only: replace every occurrence instead of requiring exactly one match (default false). Only set this when replacing all of them is intended.",
    ),
});

type EditorEditFileInput = z.infer<typeof editorEditFileInput>;

/**
 * An ordinary edit needs write access. `WebsocketController._assertClientCanApplyUpdate` lets a
 * reviewer send only tracked changes, so a reviewer is pointed at manage_tracked_changes instead.
 */
function requireWriteAccess(session: OverleafRealtimeSession): void {
  if (session.permissionsLevel === "readOnly") {
    throw new Error("This account has read-only access to the project, so it cannot edit it.");
  }
  if (session.permissionsLevel === "review") {
    throw new Error(
      "This account has review access to the project, which allows tracked changes but not direct edits. Use manage_tracked_changes (action suggest) instead.",
    );
  }
}

function replaceTextInEditor(
  context: ToolContext,
  input: EditorEditFileInput,
  findText: string,
  replaceWith: string,
): Promise<ToolTextResult> {
  requireEditorSafeText(replaceWith, "replaceWith");
  return withReviewSession(context, input.project, async (session) => {
    const document = requireDocument(session, input.path);
    const joined = await session.joinDocument(document.documentId);
    const replacement = buildReplacementOperations(
      joined.lines.join("\n"),
      findText,
      replaceWith,
      input.replaceAll ?? false,
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
}

export function registerEditorEditFileTool(server: McpServer, context: ToolContext): void {
  const actions: Record<(typeof EDITOR_EDIT_ACTIONS)[number], ToolOperation<EditorEditFileInput>> = {
    replace_text: {
      uses: ["findText", "replaceWith", "replaceAll"],
      run: (input) =>
        replaceTextInEditor(
          context,
          input,
          requireArgument(input.findText, "findText", "replace_text"),
          requireArgument(input.replaceWith, "replaceWith", "replace_text"),
        ),
    },
  };

  server.registerTool(
    "edit_file",
    {
      title: "Edit a file in Overleaf",
      description:
        "Change one file directly in Overleaf's editor; action picks how, and replace_text is the one action in this setup. " +
        "replace_text replaces an exact snippet, findText, with replaceWith: findText must match exactly, whitespace and newlines included, and occur once unless replaceAll is set, and replaceWith is inserted literally. " +
        `${NO_GIT_BRIDGE_NOTE} ` +
        "The change takes effect at once: co-authors see it immediately, with no push step and no undo here, so confirm with the user first. " +
        "It arrives as ordinary text even when the project has track changes on; use manage_tracked_changes (action suggest) to propose a change as a tracked change instead. It needs edit access, and a reviewer is pointed there. " +
        "The edit is sent against the document version it was matched in, so Overleaf merges it with a co-author's concurrent typing as it does between two open editors. " +
        "Overleaf's editor cannot store emoji or other characters outside the Basic Multilingual Plane, so a replaceWith containing one is refused; write a LaTeX command instead. " +
        "If the snippet is missing, or occurs several times without replaceAll, nothing changes and the reply gives the count; widen findText with surrounding text to make it unique. " +
        "Returns how many occurrences were replaced.",
      inputSchema: editorEditFileInput,
      annotations: WRITES_TO_OVERLEAF,
    },
    (input) =>
      runToolSafely(context, () =>
        runSelectedOperation(input.action, actions, input, ["project", "action", "path"]),
      ),
  );
}
