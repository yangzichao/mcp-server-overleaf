import type { McpServer } from "@modelcontextprotocol/server";

import type { ProjectSourceReader } from "../../latex/includes/walkIncludedFiles.js";
import type { OverleafProjectTree } from "../../overleaf/realtime/overleafProjectDocuments.js";
import { runSelectedOperation } from "../actions/toolOperations.js";
import { type ChosenRootDocument, chooseRootDocument } from "../latex/chooseRootDocument.js";
import {
  describeLookUpCitationsTool,
  lookUpCitationsInput,
  lookUpCitationsOperations,
} from "../latex/citations/lookUpCitationsOperations.js";
import { createEditorProjectSourceReader } from "../latex/editorProjectSourceReader.js";
import { withReviewSession } from "../review/openReviewSession.js";
import { READS_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext } from "../toolContext.js";
import { NO_GIT_BRIDGE_NOTE } from "./editorFileArguments.js";

/** The document asked for, else the one Overleaf compiles, else the guess the clone would make. */
function chooseEditorRootDocument(
  tree: OverleafProjectTree,
  reader: ProjectSourceReader,
  requested: string | undefined,
): Promise<ChosenRootDocument> {
  const compiled =
    requested === undefined
      ? tree.documents.find((document) => document.documentId === tree.rootDocumentId)?.path
      : undefined;
  if (compiled !== undefined) return Promise.resolve({ path: compiled, warning: undefined });
  return chooseRootDocument(reader, reader.projectFiles, requested);
}

export function registerEditorLookUpCitationsTool(server: McpServer, context: ToolContext): void {
  const operations = lookUpCitationsOperations(context, (project, read) =>
    withReviewSession(context, project, (session) => {
      const reader = createEditorProjectSourceReader(session);
      return read({
        reader,
        chooseRoot: (requested) => chooseEditorRootDocument(session.project, reader, requested),
      });
    }),
  );
  server.registerTool(
    "look_up_citations",
    {
      title: "Look up cited works",
      description: describeLookUpCitationsTool(
        `${NO_GIT_BRIDGE_NOTE} Both actions read the project as Overleaf's editor holds it now, with pending suggestions read as if accepted.`,
      ),
      inputSchema: lookUpCitationsInput,
      annotations: READS_OVERLEAF,
    },
    (input) =>
      runToolSafely(context, () =>
        runSelectedOperation(input.action, operations, input, ["project", "action"]),
      ),
  );
}
