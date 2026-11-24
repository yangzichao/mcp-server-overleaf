import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { requireArgument, runSelectedOperation, type ToolOperation } from "../actions/toolOperations.js";
import { projectArgument } from "../projectArgument.js";
import { WRITES_TO_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext } from "../toolContext.js";
import { appendInEditor } from "./editorEdits/appendInEditor.js";
import { replaceSectionInEditor } from "./editorEdits/replaceSectionInEditor.js";
import { replaceTextInEditor } from "./editorEdits/replaceTextInEditor.js";
import { writeDocumentInEditor } from "./editorEdits/writeDocumentInEditor.js";
import { editorPathArgument, NO_GIT_BRIDGE_NOTE } from "./editorFileArguments.js";

const EDITOR_EDIT_ACTIONS = ["replace_text", "replace_section", "write", "append"] as const;

const editorEditFileInput = z.object({
  project: projectArgument,
  action: z
    .enum(EDITOR_EDIT_ACTIONS)
    .describe(
      "How to edit: replace_text (an exact snippet), replace_section (a whole section, by title), write (the whole file) or append (add to the end of the file).",
    ),
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
  sectionTitle: z
    .string()
    .optional()
    .describe(
      "replace_section, required: title of the section to replace, as it appears in the sectioning command. Matched case-insensitively, with a substring fallback; read_project (view outline) lists the titles.",
    ),
  content: z
    .string()
    .optional()
    .describe(
      "replace_section, write and append, required. For replace_section, the section's full replacement, starting with its own sectioning command, e.g. \\section{Introduction} followed by the new body. For write, the complete new contents of the file. For append, the text to add after the file's last line.",
    ),
});

type EditorEditFileInput = z.infer<typeof editorEditFileInput>;

export function registerEditorEditFileTool(server: McpServer, context: ToolContext): void {
  const actions: Record<(typeof EDITOR_EDIT_ACTIONS)[number], ToolOperation<EditorEditFileInput>> = {
    replace_text: {
      uses: ["findText", "replaceWith", "replaceAll"],
      run: (input) =>
        replaceTextInEditor(context, {
          project: input.project,
          path: input.path,
          findText: requireArgument(input.findText, "findText", "replace_text"),
          replaceWith: requireArgument(input.replaceWith, "replaceWith", "replace_text"),
          replaceAll: input.replaceAll ?? false,
        }),
    },
    replace_section: {
      uses: ["sectionTitle", "content"],
      run: (input) =>
        replaceSectionInEditor(context, {
          project: input.project,
          path: input.path,
          sectionTitle: requireArgument(input.sectionTitle, "sectionTitle", "replace_section"),
          content: requireArgument(input.content, "content", "replace_section"),
        }),
    },
    write: {
      uses: ["content"],
      run: (input) =>
        writeDocumentInEditor(context, {
          project: input.project,
          path: input.path,
          content: requireArgument(input.content, "content", "write"),
        }),
    },
    append: {
      uses: ["content"],
      run: (input) =>
        appendInEditor(context, {
          project: input.project,
          path: input.path,
          content: requireArgument(input.content, "content", "append"),
        }),
    },
  };

  server.registerTool(
    "edit_file",
    {
      title: "Edit a file in Overleaf",
      description:
        "Change one file directly in Overleaf's editor; action picks how. " +
        "replace_text replaces an exact snippet, findText, with replaceWith: findText must match exactly, whitespace and newlines included, and occur once unless replaceAll is set, and replaceWith is inserted literally. Prefer it for a targeted change. " +
        "replace_section replaces one whole section of a .tex file, found by sectionTitle, from its heading to the next heading of the same or a shallower level, never swallowing \\end{document} or the bibliography; content must start with the sectioning command itself or the heading is lost. " +
        "write makes the file hold exactly content: an existing document receives only the passages that differ, and a missing one is created, with any missing parent folders. " +
        "append adds content at the end of an existing document, starting on a new line and written exactly as given; a missing file is refused, since write is the action that creates one. " +
        "replace_section, write and append send only the text that changes, so comments anchored elsewhere in the document stay where they are. " +
        `${NO_GIT_BRIDGE_NOTE} ` +
        "The change takes effect at once: co-authors see it immediately, with no push step and no undo here, so confirm with the user first. " +
        "It arrives as ordinary text even when the project has track changes on; use manage_tracked_changes (action suggest) to propose a change as a tracked change instead. It needs edit access, and a reviewer is pointed there. " +
        "The edit is sent against the document version it was read in, so Overleaf merges it with a co-author's concurrent typing as it does between two open editors. " +
        "Overleaf's editor cannot store emoji or other characters outside the Basic Multilingual Plane, so replaceWith or content containing one is refused; write a LaTeX command instead. " +
        "If the snippet or the section is missing, or the snippet occurs several times without replaceAll, nothing changes and the reply gives the count or lists the section titles. " +
        "Returns what was replaced, written, created or appended.",
      inputSchema: editorEditFileInput,
      annotations: WRITES_TO_OVERLEAF,
    },
    (input) =>
      runToolSafely(context, () =>
        runSelectedOperation(input.action, actions, input, ["project", "action", "path"]),
      ),
  );
}
