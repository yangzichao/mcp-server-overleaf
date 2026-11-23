import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { runSelectedOperation, type ToolOperation } from "../actions/toolOperations.js";
import { projectArgument } from "../projectArgument.js";
import { WRITES_TO_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext } from "../toolContext.js";
import { REVIEW_DOCUMENT_PATH } from "./reviewPathArgument.js";
import { acceptTrackedChangesAction } from "./suggestionActions/acceptTrackedChangesAction.js";
import { chooseSuggestionForm } from "./suggestionActions/chooseSuggestionForm.js";
import { rejectTrackedChangesAction } from "./suggestionActions/rejectTrackedChangesAction.js";
import { suggestEdit } from "./suggestionActions/suggestEditAction.js";
import { suggestRewrite } from "./suggestionActions/suggestRewriteAction.js";

const SUGGESTION_ACTIONS = ["suggest", "accept", "reject"] as const;

const manageTrackedChangesInput = z.object({
  project: projectArgument,
  action: z
    .enum(SUGGESTION_ACTIONS)
    .describe(
      "What to do: suggest (propose a replacement, a section or a whole document as tracked changes), accept or reject (decide suggestions already in the review panel).",
    ),
  path: z.string().describe(`Every action: ${REVIEW_DOCUMENT_PATH}`),
  findText: z
    .string()
    .optional()
    .describe(
      "suggest, with replaceWith, for one snippet: exact text to replace, matched literally including whitespace. Must occur exactly once in the document.",
    ),
  replaceWith: z
    .string()
    .optional()
    .describe(
      "suggest, with findText: the suggested replacement text. An empty string suggests deleting findText and nothing more.",
    ),
  sectionTitle: z
    .string()
    .optional()
    .describe(
      "suggest, with content, for one whole section: its title as in the sectioning command, matched case-insensitively with a substring fallback.",
    ),
  content: z
    .string()
    .optional()
    .describe(
      "suggest, instead of findText and replaceWith: the new text. With sectionTitle it replaces that section and must start with the section's own sectioning command; alone it is the complete new text of the document.",
    ),
  changeIds: z
    .array(z.string().min(1))
    .min(1)
    .optional()
    .describe(
      "accept and reject: ids of the suggestions to decide, as read_review (view tracked_changes) shows them in […]. Give these or all, not both.",
    ),
  all: z
    .boolean()
    .optional()
    .describe(
      "accept and reject: decide every suggestion in the document, whoever made it. Give this or changeIds, not both.",
    ),
});

type ManageTrackedChangesInput = z.infer<typeof manageTrackedChangesInput>;

export function registerManageTrackedChangesTool(server: McpServer, context: ToolContext): void {
  const selection = (input: ManageTrackedChangesInput) => ({
    path: input.path,
    changeIds: input.changeIds,
    all: input.all,
  });
  const actions: Record<(typeof SUGGESTION_ACTIONS)[number], ToolOperation<ManageTrackedChangesInput>> = {
    suggest: {
      uses: ["findText", "replaceWith", "sectionTitle", "content"],
      run: (input) => {
        const form = chooseSuggestionForm(input);
        if (form.kind === "snippet") {
          return suggestEdit(context, {
            project: input.project,
            path: input.path,
            findText: form.findText,
            replaceWith: form.replaceWith,
          });
        }
        return suggestRewrite(context, {
          project: input.project,
          path: input.path,
          sectionTitle: form.kind === "section" ? form.sectionTitle : undefined,
          content: form.content,
        });
      },
    },
    accept: {
      uses: ["changeIds", "all"],
      run: (input) => acceptTrackedChangesAction(context, input.project, selection(input)),
    },
    reject: {
      uses: ["changeIds", "all"],
      run: (input) => rejectTrackedChangesAction(context, input.project, selection(input)),
    },
  };

  server.registerTool(
    "manage_tracked_changes",
    {
      title: "Suggest, accept or reject tracked changes",
      description:
        "Change the suggestions in Overleaf's review panel; action picks what. " +
        "suggest proposes a change that arrives as tracked changes a co-author can accept or reject, rather than as finished text, in one of two forms. findText with replaceWith replaces one exact snippet: findText must match exactly and occur once in the document, and an empty replaceWith suggests deleting it. content rewrites more at once: with sectionTitle it is the section's full replacement, from its heading to the next heading of the same or a shallower level, and alone it is the whole document's new text; only the passages that differ become suggestions, so unchanged text keeps its comments. Use suggest when proposing a change to someone else's paper; use edit_file when the edit should simply be made. " +
        "accept makes suggestions part of the paper, so suggested insertions become ordinary text and suggested deletions are removed for good. reject undoes them: a suggested insertion is removed and a suggested deletion puts the original text back. Name the suggestions to decide by changeIds from read_review (view tracked_changes), or pass all: true for every suggestion in the document. " +
        "Every action reaches Overleaf immediately, for every collaborator, through the editor rather than the Git bridge, so there is no push step and no undo from here; confirm accept and reject with the user first. " +
        "suggest needs review access to the project and accept and reject need edit access; the call is refused before anything is sent when the account lacks it. " +
        "Overleaf's editor cannot store emoji or other characters outside the Basic Multilingual Plane, so replaceWith or content containing one is refused; write a LaTeX command instead. " +
        "Returns the suggestion made, with the number of suggested deletions and insertions a content rewrite became, or the suggestions decided after checking they are gone from the review panel.",
      inputSchema: manageTrackedChangesInput,
      annotations: WRITES_TO_OVERLEAF,
    },
    (input) =>
      runToolSafely(context, () =>
        runSelectedOperation(input.action, actions, input, ["project", "action", "path"]),
      ),
  );
}
