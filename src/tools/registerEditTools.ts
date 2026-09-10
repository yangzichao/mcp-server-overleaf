import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { findSectionByTitle, parseLatexSections, replaceSectionText } from "../latex/parseLatexSections.js";
import { replaceTextOccurrences } from "../latex/replaceTextOccurrences.js";
import { requireSynchronizedWithOverleaf } from "../workflow/synchronizeWithOverleaf.js";
import { projectArgument } from "./projectArgument.js";
import { requireFileRevision } from "./reading/fileRevisions.js";
import { runToolSafely, type ToolContext, textResult, truncateForModel } from "./toolContext.js";

const expectedRevisionArgument = z
  .string()
  .regex(/^[0-9a-f]{64}$/)
  .optional()
  .describe(
    "Require the SHA-256 revision from read_file mode=full/smart before writing; refuses stale edits after synchronization.",
  );

const EDITS_ARE_LOCAL_UNTIL_PUSHED =
  "The edit is written to the local clone only. Review it with show_diff, then call push_changes to publish it to Overleaf.";

/**
 * Edits never push on their own. Writing and publishing are separate tools so the
 * client can require approval for exactly one of them, and so a model always has a
 * chance to inspect the diff before collaborators see it.
 */
export function registerEditTools(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "replace_text",
    {
      title: "Replace exact text in a file",
      description:
        "Replace an exact snippet of text in a project file. The snippet must appear exactly once unless replaceAll is set. " +
        "This is the safest way to make a surgical edit without disturbing surrounding notation.",
      inputSchema: z.object({
        project: projectArgument,
        expectedRevision: expectedRevisionArgument,
        path: z.string().describe("Path relative to the project root."),
        findText: z.string().describe("Exact text to find, including whitespace."),
        replaceWith: z.string().describe("Replacement text."),
        replaceAll: z
          .boolean()
          .optional()
          .describe("Replace every occurrence instead of requiring a unique match."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ project, path, findText, replaceWith, replaceAll, expectedRevision }) =>
      runToolSafely(context, () =>
        context.projectRegistry.withRepository(project, async (repository) => {
          await requireSynchronizedWithOverleaf(repository);

          const originalContent = await repository.readTextFile(path);
          requireFileRevision(originalContent, expectedRevision);
          const replacement = replaceTextOccurrences(
            originalContent,
            findText,
            replaceWith,
            replaceAll ?? false,
          );

          if (replacement.status === "not-found") {
            return textResult(`Text not found in ${path}. Nothing was changed.`);
          }
          if (replacement.status === "ambiguous") {
            return textResult(
              `Text appears ${replacement.occurrenceCount} times in ${path}. Nothing was changed. ` +
                "Include more surrounding context to make the match unique, or set replaceAll.",
            );
          }

          await repository.writeTextFile(path, replacement.updatedContent);
          return textResult(
            `Replaced ${replacement.occurrenceCount} occurrence(s) in ${path}. ${EDITS_ARE_LOCAL_UNTIL_PUSHED}`,
          );
        }),
      ),
  );

  server.registerTool(
    "edit_section",
    {
      title: "Rewrite one LaTeX section",
      description:
        "Replace the whole body of one section of a .tex file, located by its title. Include the sectioning command itself in newContent.",
      inputSchema: z.object({
        project: projectArgument,
        expectedRevision: expectedRevisionArgument,
        path: z.string().describe("Path to the .tex file relative to the project root."),
        sectionTitle: z.string().describe("Title of the section to replace."),
        newContent: z
          .string()
          .describe("Replacement text for the section, including its own \\section{...} command."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ project, path, sectionTitle, newContent, expectedRevision }) =>
      runToolSafely(context, () =>
        context.projectRegistry.withRepository(project, async (repository) => {
          await requireSynchronizedWithOverleaf(repository);

          const originalContent = await repository.readTextFile(path);
          requireFileRevision(originalContent, expectedRevision);
          const sections = parseLatexSections(originalContent);
          const section = findSectionByTitle(sections, sectionTitle);
          if (!section) {
            return textResult(
              `No section matching "${sectionTitle}" in ${path}. Available: ${sections.map((entry) => entry.title).join(", ")}`,
            );
          }

          await repository.writeTextFile(path, replaceSectionText(originalContent, section, newContent));
          return textResult(
            `Replaced \\${section.level}{${section.title}} (lines ${section.startLine}-${section.endLine}) in ${path}. ${EDITS_ARE_LOCAL_UNTIL_PUSHED}`,
          );
        }),
      ),
  );

  server.registerTool(
    "write_file",
    {
      title: "Write a whole file",
      description:
        "Overwrite a project file with new content, creating it if it does not exist. Prefer replace_text or edit_section for changes to an existing file.",
      inputSchema: z.object({
        project: projectArgument,
        expectedRevision: expectedRevisionArgument,
        path: z.string().describe("Path relative to the project root."),
        content: z.string().describe("Full new file content."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ project, path, content, expectedRevision }) =>
      runToolSafely(context, () =>
        context.projectRegistry.withRepository(project, async (repository) => {
          await requireSynchronizedWithOverleaf(repository);

          const existedBefore = await repository.fileExists(path);
          if (expectedRevision !== undefined) {
            if (!existedBefore)
              throw new Error("File no longer exists. Nothing was written; read the current project again.");
            requireFileRevision(await repository.readTextFile(path), expectedRevision);
          }
          await repository.writeTextFile(path, content);
          return textResult(
            `${existedBefore ? "Overwrote" : "Created"} ${path}. ${EDITS_ARE_LOCAL_UNTIL_PUSHED}`,
          );
        }),
      ),
  );

  server.registerTool(
    "show_diff",
    {
      title: "Show pending changes",
      description:
        "Show the diff of everything edited locally but not yet pushed to Overleaf. Call this before push_changes.",
      inputSchema: z.object({ project: projectArgument }),
      annotations: { readOnlyHint: true },
    },
    async ({ project }) =>
      runToolSafely(context, () =>
        context.projectRegistry.withRepository(project, async (repository) => {
          const diff = await repository.getPendingDiff();
          return textResult(diff.trim() === "" ? "No local changes pending." : truncateForModel(diff));
        }),
      ),
  );

  server.registerTool(
    "discard_local_changes",
    {
      title: "Discard local edits",
      description:
        "Throw away every local edit that has not been pushed, returning the clone to the last version seen on Overleaf.",
      inputSchema: z.object({ project: projectArgument }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ project }) =>
      runToolSafely(context, () =>
        context.projectRegistry.withRepository(project, async (repository) => {
          const pendingFiles = await repository.getWorkingTreeStatus();
          // Unpushed commits count too. A refused push leaves one behind, and it is the
          // reason this tool exists: without it that clone can never be used again.
          const { commitsOnlyOnLocal } = await repository.describeRemoteDivergence();
          if (pendingFiles.length === 0 && commitsOnlyOnLocal === 0) {
            return textResult("No local changes to discard.");
          }

          const { discardedCommits } = await repository.discardAllLocalChanges();
          const parts = [`Discarded local changes to ${pendingFiles.length} file(s)`];
          if (discardedCommits > 0) {
            parts.push(`and ${discardedCommits} unpushed commit(s)`);
          }
          return textResult(`${parts.join(" ")}. The clone now matches Overleaf.`);
        }),
      ),
  );
}
