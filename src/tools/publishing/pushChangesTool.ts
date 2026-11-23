import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { publishToOverleaf } from "../../workflow/publishToOverleaf.js";
import { projectArgument } from "../projectArgument.js";
import { WRITES_TO_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult, truncateForModel } from "../toolContext.js";

/**
 * What a refused push asks of the model. A conflict is the user's to settle: the two versions
 * are shown to them with a proposed merge, and nothing is discarded until they agree.
 */
const AFTER_CONFLICT =
  "Do not retry, force or merge on your own. Show the user both versions and a proposed merge. " +
  "Once they approve it, call manage_files with action discard_local_changes, re-read the collaborator's version, apply the merge with edit_file, and push again.";

/**
 * Edits never push on their own. Writing and publishing are separate tools so a client can
 * require approval for exactly this one, and a model always has a chance to read the diff first.
 */
export function registerPushChangesTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "push_changes",
    {
      title: "Push changes to Overleaf",
      description:
        "Publish every pending local edit to Overleaf as one commit. This is the only tool that changes the project collaborators see, and the change is immediate and public. " +
        "Call read_project (view changes) first, and compile_project when the edit could break the build. " +
        "Before pushing, the server re-checks Overleaf and rebases onto whatever collaborators pushed in the meantime. If two edits touch the same lines the push is refused, both versions are reported, and no local work is lost: nothing is overwritten and no winner is chosen. " +
        "commitMessage labels the one commit made from the pending edits; commits already waiting from an earlier refused push keep their own messages and go out with it. Only the chosen project is pushed. " +
        "Returns the new commit hash and the diff that was published, or reports that there was nothing to push.",
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
                  `${outcome.conflictReport}\n\n${AFTER_CONFLICT}`,
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
