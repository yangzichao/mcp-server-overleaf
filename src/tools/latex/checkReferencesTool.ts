import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { checkProjectReferences } from "../../latex/references/checkProjectReferences.js";
import { requireSynchronizedWithOverleaf } from "../../workflow/synchronizeWithOverleaf.js";
import { projectArgument } from "../projectArgument.js";
import { READS_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult, truncateForModel } from "../toolContext.js";
import {
  CHECK_REFERENCES_FINDS,
  CHECK_REFERENCES_RETURNS,
  CHECK_REFERENCES_SCOPE,
  CHECK_REFERENCES_TITLE,
} from "./checkReferencesDescription.js";
import { chooseRootDocument, mainTexFileArgument } from "./chooseRootDocument.js";
import { describeReferenceCheck } from "./describeReferenceCheck.js";
import { createProjectSourceReader } from "./projectSourceReader.js";

export function registerCheckReferencesTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "check_references",
    {
      title: CHECK_REFERENCES_TITLE,
      description:
        CHECK_REFERENCES_FINDS +
        "Use it before push_changes or a compile, and after renaming a label, a citation key or a figure. " +
        CHECK_REFERENCES_SCOPE +
        "Pulls from Overleaf first. " +
        CHECK_REFERENCES_RETURNS,
      inputSchema: z.object({ project: projectArgument, mainTexFile: mainTexFileArgument }),
      annotations: READS_OVERLEAF,
    },
    async ({ project, mainTexFile }) =>
      runToolSafely(context, () =>
        context.projectRegistry.withRepository(project, async (repository) => {
          await requireSynchronizedWithOverleaf(repository);
          const reader = await createProjectSourceReader(repository);
          const root = await chooseRootDocument(repository, reader.projectFiles, mainTexFile);
          const report = describeReferenceCheck(await checkProjectReferences(reader, root.path));
          return textResult(truncateForModel(root.warning ? `${report}\n\n${root.warning}` : report));
        }),
      ),
  );
}
