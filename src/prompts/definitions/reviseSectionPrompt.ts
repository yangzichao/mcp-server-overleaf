import * as z from "zod/v4";

import { describeProject, type OverleafPrompt, projectCallHint } from "../overleafPrompt.js";

const reviseSectionArguments = z.object({
  sectionTitle: z.string().describe("Title of the section to revise, as written in \\section{...}."),
  goal: z
    .string()
    .optional()
    .describe(
      "What the revision should achieve, for example: shorter, clearer motivation, fix the notation.",
    ),
  project: z.string().optional().describe("Overleaf address, id or registered name. Omit for the default."),
});

export const reviseSectionPrompt: OverleafPrompt<z.infer<typeof reviseSectionArguments>> = {
  name: "revise_section",
  title: "Revise one section",
  description:
    "Rewrite one section of a paper toward a stated goal, show the change, and wait for approval before it reaches Overleaf.",
  argumentsSchema: reviseSectionArguments,
  isOffered: () => true,
  buildText: ({ sectionTitle, goal, project }, groups) => {
    const lines = [
      `Revise the section "${sectionTitle}" of ${describeProject(project)}.${projectCallHint(project)}`,
      `Goal: ${goal ?? "make it clearer and tighter without changing what it claims"}.`,
      "",
      `1. Read it with read_file (sectionTitle "${sectionTitle}"); use read_project (view outline) if the title does not match.`,
      "2. Keep every citation, label, reference and equation unless the goal says otherwise, and keep the paper's terminology and notation.",
    ];
    if (groups.gitBridge) {
      lines.push(
        "3. Apply the revision with edit_file (action replace_text for a few sentences, replace_section to rewrite it), then show me read_project (view changes).",
        "4. Do not call push_changes until I approve the diff.",
      );
    } else {
      lines.push(
        "3. Show me the revised section first. edit_file changes the live paper at once, so only after I approve, apply it with edit_file (action replace_section, or replace_text for a few sentences).",
      );
    }
    if (groups.sessionCookie) {
      lines.push(
        "If co-authors should review the change, offer to send it as tracked changes instead, with manage_tracked_changes (action suggest, passing sectionTitle and the revised section as content).",
      );
    }
    return lines.join("\n");
  },
};
