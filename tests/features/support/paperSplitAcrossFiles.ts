import type { PublishedFile } from "./connectedOverleafProject.js";

/** A root document that pulls its method in from another file, and names one file that is missing. */
const splitPaperMain = [
  "\\documentclass{article}",
  "\\begin{document}",
  "\\section{Introduction}",
  "The sample size is 5000.",
  "\\input{sections/method}",
  "\\input{sections/missing}",
  "\\section{Conclusion}",
  "Placeholder.",
  "\\end{document}",
].join("\n");

const splitPaperMethod = [
  "\\section{Method}",
  "We sampled 5000 people.",
  "\\subsection{Data}",
  "The data came from a survey.",
].join("\n");

export const paperSplitAcrossFiles: readonly PublishedFile[] = [
  { path: "main.tex", content: splitPaperMain, commitMessage: "Initial draft" },
  { path: "sections/method.tex", content: splitPaperMethod, commitMessage: "Write the method" },
];
