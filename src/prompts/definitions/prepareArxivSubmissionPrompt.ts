import * as z from "zod/v4";

import { describeProject, type OverleafPrompt, projectCallHint } from "../overleafPrompt.js";

const prepareArxivSubmissionArguments = z.object({
  project: z.string().optional().describe("Overleaf address, id or registered name. Omit for the default."),
});

export const prepareArxivSubmissionPrompt: OverleafPrompt<z.infer<typeof prepareArxivSubmissionArguments>> = {
  name: "prepare_arxiv_submission",
  title: "Prepare an arXiv submission",
  description:
    "Check that a paper is ready for arXiv and assemble the upload: references, citations, a clean compile, and a source folder without comments or unused files.",
  argumentsSchema: prepareArxivSubmissionArguments,
  isOffered: () => true,
  buildText: ({ project }, groups) => {
    const checks = [
      "check_references, and fix anything undefined or missing first.",
      "look_up_citations (action verify), and show me entries that do not resolve.",
      "compile_project, and show me every error and any overfull box warning.",
    ];
    return [
      `Prepare ${describeProject(project)} for arXiv.${projectCallHint(project)}`,
      "",
      ...checks.map((step, index) => `${index + 1}. ${step}`),
      "",
      "Then assemble the upload outside the project, never inside the local clone:",
      `- If you can run shell commands, copy the project out${groups.gitBridge ? " of the clone that read_project (view overview) reports" : ""}${groups.sessionCookie ? " or download it with manage_project (action download_zip)" : ""}, strip comments and unused files (arxiv_latex_cleaner with --keep_bib, or latexpand), and test-compile the result.`,
      "- arXiv runs BibTeX and Biber itself, so include the .bib files; a .bbl must share the main .tex file's base name, and a biblatex .bbl must be format 3.3 (TeX Live 2025).",
      "- Without a shell, list exactly which files to remove and which comments to strip, so I can do it.",
      "",
      "Give me the path of the folder or ZIP to upload. Do not upload or submit anything yourself.",
    ].join("\n");
  },
};
