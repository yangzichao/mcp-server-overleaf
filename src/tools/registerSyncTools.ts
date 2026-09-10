import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { formatCompileReport } from "../latex/formatCompileReport.js";
import { containsDocumentEnvironment, guessMainTexFile } from "../latex/latexProjectFiles.js";
import { compileLatexProject } from "../workflow/compileLatexProject.js";
import { publishToOverleaf } from "../workflow/publishToOverleaf.js";
import { synchronizeWithOverleaf } from "../workflow/synchronizeWithOverleaf.js";
import { projectArgument } from "./projectArgument.js";
import {
  buildDirectoryForProject,
  runToolSafely,
  type ToolContext,
  textResult,
  truncateForModel,
} from "./toolContext.js";

export function registerSyncTools(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "project_status",
    {
      title: "Project status",
      description:
        "Report whether the local clone is in step with Overleaf: commits pulled, edits pending, and the recent history.",
      inputSchema: z.object({ project: projectArgument }),
      annotations: { readOnlyHint: true },
    },
    async ({ project }) =>
      runToolSafely(context, () =>
        context.projectRegistry.withRepository(project, async (repository) => {
          const synchronization = await synchronizeWithOverleaf(repository);
          const recentLog = await repository.getRecentCommitLog(10);

          const lines = [
            `branch: ${synchronization.branchName}`,
            `head: ${synchronization.headCommitHash.slice(0, 10)}`,
            `commits pulled from Overleaf just now: ${synchronization.pulledCommits}`,
            `commits on Overleaf not yet merged in: ${synchronization.commitsStillOnlyOnRemote}`,
            `local commits not yet pushed: ${synchronization.localCommitsNotYetPushed}`,
            `files edited locally and not yet committed: ${synchronization.uncommittedFiles.length}`,
          ];
          if (synchronization.uncommittedFiles.length > 0) {
            lines.push(...synchronization.uncommittedFiles.map((entry) => `  ${entry}`));
          }
          if (synchronization.rebaseConflict) {
            lines.push(
              "",
              "WARNING: synchronization could not finish. Local work was preserved; the clone is not up to date.",
              synchronization.rebaseConflict,
            );
          }
          lines.push("", "recent history:", recentLog);

          return textResult(lines.join("\n"));
        }),
      ),
  );

  server.registerTool(
    "sync_project",
    {
      title: "Pull from Overleaf",
      description: "Pull the latest commits from Overleaf into the local clone without changing anything.",
      inputSchema: z.object({ project: projectArgument }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ project }) =>
      runToolSafely(context, () =>
        context.projectRegistry.withRepository(project, async (repository) => {
          const synchronization = await synchronizeWithOverleaf(repository);
          if (synchronization.rebaseConflict || synchronization.commitsStillOnlyOnRemote > 0) {
            throw new Error(
              `Cannot synchronize with Overleaf. Local work was preserved. Review with show_diff, then publish or explicitly discard it.\n${synchronization.rebaseConflict ?? "Remote commits remain unmerged."}`,
            );
          }
          return textResult(
            `Up to date with Overleaf. Pulled ${synchronization.pulledCommits} commit(s); ` +
              `${synchronization.localCommitsNotYetPushed} local commit(s) still unpushed.`,
          );
        }),
      ),
  );

  server.registerTool(
    "compile_project",
    {
      title: "Compile the project",
      description:
        "Compile the project locally with latexmk and report errors and warnings. Build artifacts are written outside the clone, so they are never pushed to Overleaf.",
      inputSchema: z.object({
        project: projectArgument,
        mainTexFile: z
          .string()
          .optional()
          .describe("Root .tex file. Omitted, the server guesses it from the project layout."),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ project, mainTexFile }) =>
      runToolSafely(context, () =>
        context.projectRegistry.withRepository(project, async (repository) => {
          let resolvedMainTexFile = mainTexFile;
          if (!resolvedMainTexFile) {
            const guessed = guessMainTexFile(await repository.listTrackedFiles());
            if (!guessed) {
              return textResult("No .tex file found in the project, so there is nothing to compile.");
            }
            resolvedMainTexFile = guessed;
          }

          const mainFileContent = await repository.readTextFile(resolvedMainTexFile);
          if (!containsDocumentEnvironment(mainFileContent)) {
            return textResult(
              `${resolvedMainTexFile} has no \\begin{document}, so it is an included fragment rather than the root document. ` +
                "Pass mainTexFile explicitly.",
            );
          }

          await repository.materializeAllFiles();
          const result = await compileLatexProject({
            repositoryDirectory: repository.repositoryDirectory,
            buildDirectory: buildDirectoryForProject(context.configuration, repository.repositoryDirectory),
            mainTexFile: resolvedMainTexFile,
            timeoutMs: context.configuration.compileTimeoutMs,
          });

          return textResult(truncateForModel(formatCompileReport(result)));
        }),
      ),
  );

  server.registerTool(
    "push_changes",
    {
      title: "Push changes to Overleaf",
      description:
        "Commit the pending local edits and push them to Overleaf. Before pushing, the server re-checks Overleaf and rebases onto anything collaborators pushed in the meantime; if that cannot be done cleanly the push is refused and the conflict is reported.",
      inputSchema: z.object({
        project: projectArgument,
        commitMessage: z
          .string()
          .describe("Commit message describing the change, e.g. 'Rewrite Section 4 discussion'."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ project, commitMessage }) =>
      runToolSafely(context, () =>
        context.projectRegistry.withRepository(project, async (repository) => {
          const outcome = await publishToOverleaf(repository, commitMessage);

          switch (outcome.status) {
            case "nothing-to-push":
              return textResult("Nothing to push: there are no local changes.");
            case "conflict-with-collaborator":
              throw new Error(
                "Push refused. Local commits could not be rebased onto Overleaf. Nothing was pushed and no local work was lost.\n\n" +
                  `${outcome.conflictReport}\n\n` +
                  "Review and preserve your changes with show_diff. Only if you intend to discard them, call discard_local_changes; then re-read the collaborator's version and make a new edit.",
              );
            case "push-rejected":
              throw new Error(
                `Overleaf rejected the push. Local commits remain available for review and retry.\n\n${outcome.report}`,
              );
            case "pushed":
              return textResult(
                `Pushed to Overleaf as ${outcome.commitHash.slice(0, 10)}. The changes are now live in the Overleaf editor.\n\n` +
                  truncateForModel(outcome.diff, 20_000),
              );
          }
        }),
      ),
  );
}
