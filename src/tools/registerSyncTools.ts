import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { formatCompileReport } from "../latex/formatCompileReport.js";
import { containsDocumentEnvironment, guessMainTexFile } from "../latex/latexProjectFiles.js";
import { compileLatexProject } from "../workflow/compileLatexProject.js";
import { publishToOverleaf } from "../workflow/publishToOverleaf.js";
import { synchronizeWithOverleaf } from "../workflow/synchronizeWithOverleaf.js";
import { projectArgument } from "./projectArgument.js";
import { READS_OVERLEAF, UPDATES_LOCAL_CLONE_SAFELY, WRITES_TO_OVERLEAF } from "./toolAnnotations.js";
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
        "Report where the local clone stands relative to Overleaf: the branch and head commit, how many commits were just pulled, " +
        "how many remain unmerged, how many local commits are waiting to be pushed, which files are edited but not committed, and the last ten commits. " +
        "Pulls from Overleaf as part of answering. Call this to find out whether there is anything to push or anything a collaborator has changed; " +
        "use show_diff instead to see what the pending edits actually say.",
      inputSchema: z.object({ project: projectArgument }),
      annotations: READS_OVERLEAF,
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
      description:
        "Pull the latest commits from Overleaf into the local clone. Nothing is sent to Overleaf and no local edit is discarded. " +
        "The read tools pull on their own, so this is rarely needed first; call it to check explicitly that the clone is current, " +
        "or after a collaborator says they have pushed. " +
        "If the pull cannot complete cleanly it fails and leaves local work untouched, rather than resolving the conflict on its own.",
      inputSchema: z.object({ project: projectArgument }),
      annotations: UPDATES_LOCAL_CLONE_SAFELY,
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
        "Compile the project locally with latexmk and report the errors and warnings, so a broken paper is found before collaborators see it. " +
        "Call this after editing and before push_changes. " +
        "Build artifacts go to a directory outside the clone, so they are never pushed to Overleaf, and no PDF is returned — only the log. " +
        "This is the one tool that needs latexmk and a TeX distribution installed locally; without them it reports that rather than compiling. " +
        "It also fills in any files sparse checkout was holding back, since figures have to be on disk to compile.",
      inputSchema: z.object({
        project: projectArgument,
        mainTexFile: z
          .string()
          .optional()
          .describe(
            "Path to the root .tex file, the one containing \\begin{document}. Omitted, the server guesses it from the project layout and says so if the guess has no document environment.",
          ),
      }),
      annotations: READS_OVERLEAF,
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
        "Publish every pending local edit to Overleaf as one commit. This is the only tool that changes the project collaborators see, and the change is immediate and public. " +
        "Call show_diff first, and compile_project when the edit could break the build. " +
        "Before pushing, the server re-checks Overleaf and rebases onto whatever collaborators pushed in the meantime. " +
        "If two edits touch the same lines the push is refused, both versions are reported, and no local work is lost — nothing is overwritten and no winner is chosen. " +
        "Reports that there was nothing to push when the clone has no pending edits.",
      inputSchema: z.object({
        project: projectArgument,
        commitMessage: z
          .string()
          .describe(
            'Message describing the change, shown in the project\'s Overleaf history. One line, written for a co-author, e.g. "Rewrite Section 4 discussion".',
          ),
      }),
      annotations: WRITES_TO_OVERLEAF,
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
