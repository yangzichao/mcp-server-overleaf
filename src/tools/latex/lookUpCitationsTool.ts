import type { McpServer } from "@modelcontextprotocol/server";

import { requireSynchronizedWithOverleaf } from "../../workflow/synchronizeWithOverleaf.js";
import { runSelectedOperation } from "../actions/toolOperations.js";
import { READS_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext } from "../toolContext.js";
import { chooseRootDocument } from "./chooseRootDocument.js";
import {
  describeLookUpCitationsTool,
  lookUpCitationsInput,
  lookUpCitationsOperations,
} from "./citations/lookUpCitationsOperations.js";
import { createProjectSourceReader } from "./projectSourceReader.js";

export function registerLookUpCitationsTool(server: McpServer, context: ToolContext): void {
  const operations = lookUpCitationsOperations(context, (project, read) =>
    context.projectRegistry.withRepository(project, async (repository) => {
      await requireSynchronizedWithOverleaf(repository);
      const reader = await createProjectSourceReader(repository);
      return read({
        reader,
        chooseRoot: (requested) => chooseRootDocument(repository, reader.projectFiles, requested),
      });
    }),
  );
  server.registerTool(
    "look_up_citations",
    {
      title: "Look up cited works",
      description: describeLookUpCitationsTool(
        "Both actions pull from Overleaf first and read the project's files in the clone.",
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
