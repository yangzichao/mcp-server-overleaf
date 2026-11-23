import * as z from "zod/v4";

import { describeProject, type OverleafPrompt, projectCallHint } from "../overleafPrompt.js";

const reviewPaperArguments = z.object({
  project: z.string().optional().describe("Overleaf address, id or registered name. Omit for the default."),
});

export const reviewPaperPrompt: OverleafPrompt<z.infer<typeof reviewPaperArguments>> = {
  name: "review_paper",
  title: "Review the paper",
  description:
    "Read a paper end to end and report problems by severity, from broken references to unclear writing, without changing anything.",
  argumentsSchema: reviewPaperArguments,
  isOffered: () => true,
  buildText: ({ project }, groups) => {
    const steps = [
      "Call read_project for the overview, then its outline view, to see how the paper is organised.",
      ...(groups.gitBridge
        ? [
            "Run check_references for undefined, duplicate and unused labels and citations, and missing files.",
            "Run look_up_citations (action verify) to find bibliography entries that name the wrong work or none.",
          ]
        : []),
      "Run compile_project and read its errors and warnings.",
      "Read the paper section by section with read_file (sectionTitle), looking for unclear sentences, undefined notation, inconsistent terms, claims without support, and figures or tables never referred to.",
    ];
    return [
      `Review ${describeProject(project)} as a careful co-author would.${projectCallHint(project)}`,
      "",
      ...steps.map((step, index) => `${index + 1}. ${step}`),
      "",
      "Report the findings grouped as errors, likely problems, and suggestions, each with its file and line and a proposed fix. Do not edit, comment or push anything until I say which fixes to make.",
    ].join("\n");
  },
};
