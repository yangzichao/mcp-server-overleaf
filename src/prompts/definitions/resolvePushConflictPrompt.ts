import * as z from "zod/v4";

import { describeProject, type OverleafPrompt, projectCallHint } from "../overleafPrompt.js";

const resolvePushConflictArguments = z.object({
  project: z.string().optional().describe("Overleaf address, id or registered name. Omit for the default."),
});

export const resolvePushConflictPrompt: OverleafPrompt<z.infer<typeof resolvePushConflictArguments>> = {
  name: "resolve_push_conflict",
  title: "Resolve a refused push",
  description:
    "After push_changes refused because a co-author changed the same lines, draft a merge of both versions and apply it only once approved.",
  argumentsSchema: resolvePushConflictArguments,
  isOffered: (groups) => groups.gitBridge,
  buildText: ({ project }) =>
    [
      `push_changes refused in ${describeProject(project)} because a co-author changed the same lines.${projectCallHint(project)} Nothing was lost on either side.`,
      "",
      "1. Show me both versions of every conflicting passage from the refusal, side by side. If the refusal is no longer in this conversation, read_project (view status) reports the conflict and read_project (view changes) shows the unpushed edits.",
      "2. Draft one merged passage for each conflict that keeps both authors' intent, and say what you took from each side.",
      "3. Wait for me to approve or edit the drafts.",
      "4. Then: manage_files (action discard_local_changes) to drop the refused local commit, read_file to load the co-author's current text, edit_file to apply the approved merge, read_project (view changes) to show me the result, and push_changes only after I confirm.",
      "",
      "Discarding drops every unpushed local edit, so before step 4 make sure each one is in the approved merge or deliberately dropped. Do not retry the push unchanged, and do not choose between the versions yourself.",
    ].join("\n"),
};
