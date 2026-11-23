import { resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { requireSynchronizedWithOverleaf } from "../../workflow/synchronizeWithOverleaf.js";
import { revisionArgument } from "../history/revisionArgument.js";
import { projectArgument } from "../projectArgument.js";
import { READS_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult } from "../toolContext.js";
import { presentFileText } from "./presentFileText.js";
import {
  assertCompatibleReadArguments,
  endLineArgument,
  SECTION_TITLE_DESCRIPTION,
  startLineArgument,
} from "./readFileArguments.js";

export function registerReadFileTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "read_file",
    {
      title: "Read a project file",
      description:
        "Read one text file from the project after pulling the latest commits from Overleaf. " +
        "Plain calls return the text, line-numbered when startLine or endLine is given; startLine alone reads to the end, and endLine is clamped to the file. " +
        "sectionTitle returns one section of a .tex file instead, so the rest of a long paper stays out of context: from its heading to the next heading at the same or a shallower level, stopping before trailing matter such as \\appendix, the bibliography or \\end{document}. It is compared case-insensitively with the title in braces, not an optional [short] title: an exact match wins, otherwise the first heading in document order that contains it, and if nothing matches the reply lists the titles that exist. " +
        "mode=full returns JSON with the content and a revision hash for a guarded edit; mode=smart with previousRevision returns kind unchanged, a delta, or full content when this server process does not know that revision or a delta would be no smaller. " +
        "Use a line range to sample a large file, mode=full before an edit that passes expectedRevision, and mode=smart to re-read a file already read. " +
        "Apply a delta only to its exact baseline: split on newline, replace deleteLineCount lines at the 1-based startLine with change.lines, and join on newline. " +
        "Plain text is cut off after 60,000 characters; in a revision mode, a file too large to return whole comes back truncated with no revision. " +
        "With revision, reads the file as it was at that commit from read_history instead, as plain text; line ranges and sectionTitle work, mode does not. " +
        "Fails without reading for a missing or binary file, a path outside the project, a line range or sectionTitle combined with mode, sectionTitle combined with a line range, or startLine after endLine.",
      inputSchema: z.object({
        project: projectArgument,
        path: z.string().describe("Path to the file relative to the project root, e.g. sections/intro.tex."),
        startLine: startLineArgument.describe(
          "First line to return, 1-indexed. Cannot be combined with mode or sectionTitle.",
        ),
        endLine: endLineArgument.describe(
          "Last line to return, inclusive. Cannot be combined with mode or sectionTitle.",
        ),
        sectionTitle: z
          .string()
          .optional()
          .describe(
            `${SECTION_TITLE_DESCRIPTION} read_project (view outline) lists the titles. Cannot be combined with startLine, endLine or mode; revision works.`,
          ),
        mode: z
          .enum(["full", "smart"])
          .optional()
          .describe(
            'Return revision-aware JSON instead of plain text: "full" for whole content plus a revision, "smart" for a delta against previousRevision. Cannot be combined with startLine, endLine or sectionTitle.',
          ),
        previousRevision: z
          .string()
          .regex(/^[0-9a-f]{64}$/)
          .optional()
          .describe(
            "A 64-character revision hash this server returned for this same file earlier in this session. Requires mode=smart.",
          ),
        revision: revisionArgument
          .optional()
          .describe(
            "Read the file as it was at this commit hash, as read_history prints it. Cannot be combined with mode.",
          ),
      }),
      annotations: READS_OVERLEAF,
    },
    async ({ project, path, startLine, endLine, sectionTitle, mode, previousRevision, revision }) =>
      runToolSafely(context, () => {
        assertCompatibleReadArguments({ startLine, endLine, sectionTitle, mode, previousRevision, revision });
        return context.projectRegistry.withRepository(project, async (repository) => {
          await requireSynchronizedWithOverleaf(repository);
          const content = revision
            ? await repository.history().readTextAt(revision, path)
            : await repository.readTextFile(path);
          if (mode) {
            const scope = resolve(repository.repositoryDirectory, path);
            return textResult(JSON.stringify(context.fileRevisions.read(scope, content, previousRevision)));
          }
          return textResult(presentFileText(path, content, { sectionTitle, startLine, endLine }));
        });
      }),
  );
}
