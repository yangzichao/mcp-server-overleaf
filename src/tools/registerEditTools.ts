import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { findSectionByTitle, parseLatexSections, replaceSectionText } from "../latex/parseLatexSections.js";
import { replaceTextOccurrences } from "../latex/replaceTextOccurrences.js";
import { requireSynchronizedWithOverleaf } from "../workflow/synchronizeWithOverleaf.js";
import { registerFileLifecycleTools } from "./editing/fileLifecycleTools.js";
import { projectArgument } from "./projectArgument.js";
import { requireFileRevision } from "./reading/fileRevisions.js";
import { EDITS_LOCAL_CLONE, EDITS_LOCAL_CLONE_IDEMPOTENTLY, READS_OVERLEAF } from "./toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult, truncateForModel } from "./toolContext.js";

const expectedRevisionArgument = z
  .string()
  .regex(/^[0-9a-f]{64}$/)
  .optional()
  .describe(
    "Optional guard: the 64-character revision hash returned by read_file with mode=full or mode=smart for this same file. " +
      "When given, the edit is refused if the file changed since that read — for example because pulling from Overleaf brought in a collaborator's version. " +
      "Pass it whenever the edit depends on content you read earlier.",
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
        "Replace an exact snippet of text in a project file. Prefer this over write_file and edit_section for a targeted change: " +
        "it touches nothing outside the snippet, so surrounding LaTeX notation cannot be disturbed. " +
        "The snippet must match exactly, whitespace included, and must appear exactly once unless replaceAll is set; " +
        "if it appears several times the call changes nothing and reports the count, so add surrounding context to make it unique. " +
        "The edit is written to the local clone only — nothing reaches Overleaf until push_changes.",
      inputSchema: z.object({
        project: projectArgument,
        expectedRevision: expectedRevisionArgument,
        path: z.string().describe("Path relative to the project root."),
        findText: z
          .string()
          .describe(
            "Exact text to find, matched literally including whitespace and newlines. Not a regular expression.",
          ),
        replaceWith: z.string().describe("Text to put in its place. Empty string deletes the snippet."),
        replaceAll: z
          .boolean()
          .optional()
          .describe(
            "Replace every occurrence instead of requiring exactly one match (default false). Only set this when replacing all of them is intended.",
          ),
      }),
      annotations: EDITS_LOCAL_CLONE,
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
        "Replace one whole section of a .tex file, located by its title. " +
        "newContent replaces everything from the sectioning command to the end of the section, so it must include the \\section{...} command itself or the heading is lost. " +
        "The section ends at the next heading of the same or a shallower level, or at trailing matter such as \\end{document} or the bibliography, which is never swallowed. " +
        "Use replace_text for a smaller change; use this when rewriting a section wholesale. " +
        "The edit is written to the local clone only — nothing reaches Overleaf until push_changes.",
      inputSchema: z.object({
        project: projectArgument,
        expectedRevision: expectedRevisionArgument,
        path: z.string().describe("Path to the .tex file relative to the project root."),
        sectionTitle: z
          .string()
          .describe(
            "Title of the section to replace, as it appears in the sectioning command. Matched case-insensitively, with a substring fallback. Call list_sections if unsure.",
          ),
        newContent: z
          .string()
          .describe(
            "The section's full replacement text, starting with its own sectioning command, e.g. \\section{Introduction} followed by the new body.",
          ),
      }),
      annotations: EDITS_LOCAL_CLONE,
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
        "Overwrite a project file with new content, creating it and any missing parent directories if it does not exist. " +
        "This replaces the whole file, so use it to add a new file; for a change to an existing one prefer replace_text or edit_section, " +
        "which cannot accidentally drop the parts you did not mean to rewrite. " +
        "The file is written to the local clone only — nothing reaches Overleaf until push_changes.",
      inputSchema: z.object({
        project: projectArgument,
        expectedRevision: expectedRevisionArgument,
        path: z
          .string()
          .describe(
            "Path relative to the project root, e.g. sections/related-work.tex. Must stay inside the project.",
          ),
        content: z.string().describe("The complete new contents of the file, not a fragment to append."),
      }),
      annotations: EDITS_LOCAL_CLONE_IDEMPOTENTLY,
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
        "Show a unified diff of every local edit that has not yet been pushed to Overleaf, across all files. " +
        "Call this before push_changes to see exactly what collaborators are about to receive, and after a refused push to inspect work that is still pending. " +
        'Reports "No local changes pending." when the clone matches Overleaf.',
      inputSchema: z.object({ project: projectArgument }),
      annotations: READS_OVERLEAF,
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
        "Permanently throw away every local edit and unpushed commit, resetting the clone to the last version seen on Overleaf. " +
        "The discarded work cannot be recovered from this server. Call show_diff first, and only call this once the user has said the work should be abandoned. " +
        "Its main use is after push_changes refuses a conflicting change: the clone cannot be pushed again until the conflicting local commits are either published or discarded here.",
      inputSchema: z.object({ project: projectArgument }),
      annotations: EDITS_LOCAL_CLONE_IDEMPOTENTLY,
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

  registerFileLifecycleTools(server, context);
}
