import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { OverleafDocumentEntry } from "../../overleaf/realtime/overleafProjectDocuments.js";
import type { OverleafRealtimeSession } from "../../overleaf/realtime/overleafRealtimeSession.js";
import {
  acceptTrackedChanges,
  buildRejectionOperations,
} from "../../overleaf/realtime/trackedChangeDecisions.js";
import { describeLineForPosition, type TrackedChange } from "../../overleaf/realtime/trackedChangeRanges.js";
import { projectArgument } from "../projectArgument.js";
import { WRITES_TO_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult, truncateForModel } from "../toolContext.js";
import { requireOverleafWebClient } from "../web/requireOverleafWebClient.js";
import { requireDocument, requireEditCapableProject, withReviewSession } from "./openReviewSession.js";

/**
 * Deciding suggestions: accepting makes a suggestion part of the paper, rejecting undoes it.
 *
 * Both re-read the document afterwards and check the suggestions are gone, because an
 * acknowledgement from Overleaf says the request arrived, not that the review panel changed.
 */

const decisionInput = z.object({
  project: projectArgument,
  path: z.string().describe("Path of the document relative to the project root, for example main.tex."),
  changeIds: z
    .array(z.string().min(1))
    .min(1)
    .optional()
    .describe(
      "Ids of the suggestions to decide, as list_tracked_changes shows them in […]. Give these or all, not both.",
    ),
  all: z
    .boolean()
    .optional()
    .describe("Decide every suggestion in the document, whoever made it. Give this or changeIds, not both."),
});

type DecisionInput = z.infer<typeof decisionInput>;

interface SelectedChanges {
  readonly document: OverleafDocumentEntry;
  readonly lines: readonly string[];
  readonly version: number;
  readonly changes: readonly TrackedChange[];
}

async function selectChanges(
  session: OverleafRealtimeSession,
  input: DecisionInput,
): Promise<SelectedChanges> {
  if ((input.changeIds === undefined) === (input.all !== true)) {
    throw new Error("Give either changeIds or all: true, so it is explicit which suggestions to decide.");
  }
  const document = requireDocument(session, input.path);
  const joined = await session.joinDocument(document.documentId);
  if (joined.ranges.changes.length === 0)
    throw new Error(`There are no tracked changes in ${document.path}.`);
  if (input.all)
    return { document, lines: joined.lines, version: joined.version, changes: joined.ranges.changes };

  const requested = new Set(input.changeIds);
  const changes = joined.ranges.changes.filter((change) => requested.has(change.changeId));
  const unknown = [...requested].filter(
    (changeId) => !changes.some((change) => change.changeId === changeId),
  );
  if (unknown.length > 0) {
    throw new Error(
      `No tracked change ${unknown.join(", ")} in ${document.path}, so nothing was decided. list_tracked_changes shows the current ids; they change when a suggestion is edited.`,
    );
  }
  return { document, lines: joined.lines, version: joined.version, changes };
}

async function confirmChangesGone(
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

function describeDecided(verb: string, selected: SelectedChanges): string {
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

export function registerTrackedChangeDecisionTools(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "accept_tracked_changes",
    {
      title: "Accept tracked changes",
      description:
        "Accept suggestions in a document, so that suggested insertions become ordinary text and suggested deletions are removed for good. " +
        "Takes effect in Overleaf immediately, for every collaborator; there is no separate push and no undo from here. " +
        "Name the suggestions by id from list_tracked_changes, or pass all: true for every suggestion in the document. " +
        "Needs edit access to the project; a reviewer account cannot accept. " +
        "Returns the accepted suggestions, after checking they are gone from the review panel.",
      inputSchema: decisionInput,
      annotations: WRITES_TO_OVERLEAF,
    },
    async (input) =>
      runToolSafely(context, () =>
        withReviewSession(context, input.project, async (session) => {
          requireEditCapableProject(session);
          const webClient = requireOverleafWebClient(context);
          const selected = await selectChanges(session, input);
          await acceptTrackedChanges(
            webClient,
            session.project.projectId,
            selected.document.documentId,
            selected.changes.map((change) => change.changeId),
          );
          await confirmChangesGone(session, selected);
          return textResult(describeDecided("Accepted", selected));
        }),
      ),
  );

  server.registerTool(
    "reject_tracked_changes",
    {
      title: "Reject tracked changes",
      description:
        "Reject suggestions in a document: a suggested insertion is removed and a suggested deletion puts the original text back. " +
        "Takes effect in Overleaf immediately, for every collaborator; there is no separate push and no undo from here. " +
        "Name the suggestions by id from list_tracked_changes, or pass all: true for every suggestion in the document. " +
        "Needs edit access to the project; a reviewer account cannot reject. " +
        "Returns the rejected suggestions, after checking they are gone from the review panel.",
      inputSchema: decisionInput,
      annotations: WRITES_TO_OVERLEAF,
    },
    async (input) =>
      runToolSafely(context, () =>
        withReviewSession(context, input.project, async (session) => {
          requireEditCapableProject(session);
          const selected = await selectChanges(session, input);
          const operations = buildRejectionOperations(selected.lines, selected.changes);
          await session.applyOperations(selected.document.documentId, selected.version, operations);
          await confirmChangesGone(session, selected);
          return textResult(describeDecided("Rejected", selected));
        }),
      ),
  );
}
