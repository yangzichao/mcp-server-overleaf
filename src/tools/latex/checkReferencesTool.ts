import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { checkProjectReferences } from "../../latex/references/checkProjectReferences.js";
import { requireSynchronizedWithOverleaf } from "../../workflow/synchronizeWithOverleaf.js";
import { projectArgument } from "../projectArgument.js";
import { READS_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult, truncateForModel } from "../toolContext.js";
import { chooseRootDocument, mainTexFileArgument } from "./chooseRootDocument.js";
import { describeReferenceCheck } from "./describeReferenceCheck.js";
import { createProjectSourceReader } from "./projectSourceReader.js";

export function registerCheckReferencesTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "check_references",
    {
      title: "Check references, citations and included files",
      description:
        "Check a LaTeX document's cross-references and citations from its source, without compiling: \\ref, \\eqref, \\cref and similar with no matching \\label; \\cite keys found in no .bib file or \\bibitem; labels and bibliography keys defined twice; and \\input, \\include, \\includegraphics and bibliography files that do not exist. " +
        "Use it before push_changes or a compile, and after renaming a label, a citation key or a figure. " +
        "It starts at the main document and follows \\input, \\include, \\subfile and \\import, so a .tex file the document never includes is listed, not checked. Comments and verbatim blocks are ignored, and a path or key built from a macro is counted rather than guessed. " +
        "Pulls from Overleaf first. Returns a verdict line with the number of problems, each problem with its file and line, then labels never referenced and bibliography entries never cited, which are worth a look but are not errors.",
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
