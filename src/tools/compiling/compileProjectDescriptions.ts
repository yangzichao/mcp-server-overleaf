/**
 * compile_project's description in each configuration. The tool can compile in two places, and
 * a configuration that offers only one describes only that one.
 */

const LOCAL_COMPILE =
  "It compiles the clone as it stands, local edits included, without pulling, and halts at the first error. " +
  "Without mainTexFile it tries main.tex, paper.tex, manuscript.tex, root.tex, thesis.tex and article.tex at the root, then the shallowest .tex file, and stops with a message if that file has no \\begin{document}. " +
  "Build artifacts go to a directory outside the clone, so they are never pushed, and the reply gives the path of the PDF there when the compile produced one. " +
  "Without latexmk and a TeX distribution installed locally it says so instead of compiling; a run past the configured timeout, 180 seconds by default, is reported as an error. " +
  "It also restores any files sparse checkout was holding back, since figures must be on disk to compile.";

export const LOCAL_ONLY_COMPILE_DESCRIPTION =
  "Compile one project locally with latexmk -pdf and report the errors and warnings, so a broken paper is caught before collaborators see it. Call it after editing and before push_changes. " +
  `${LOCAL_COMPILE} ` +
  "Returns a verdict line, then errors, then warnings, then the end of the log when the compile failed.";

export const OVERLEAF_ONLY_COMPILE_DESCRIPTION =
  "Compile the project on Overleaf's own servers, exactly as the Recompile button does, and report the errors and warnings from the log, so a broken paper is caught before collaborators see it. " +
  "It compiles what is in Overleaf now, edits made with edit_file included, and needs no TeX installation here. " +
  "It uses the project's compiler and TeX Live version from Overleaf's settings, and the account's plan decides the time limit. " +
  "Without mainTexFile it compiles the main document set in Overleaf's menu. " +
  "output.pdf, when the compile produced one, and output.log are saved to this server's build directory, replacing the previous compile's, and the reply gives both paths. " +
  "Returns a verdict line, then errors, then warnings, including BibTeX's and biber's from output.blg, then where the PDF and log were saved and which output files exist.";

export const BOTH_PLACES_COMPILE_DESCRIPTION =
  "Compile one project and report the errors and warnings, so a broken paper is caught before collaborators see it; where picks the compiler. Call it after editing and before push_changes. " +
  "local, the default, runs latexmk -pdf on this computer. " +
  `${LOCAL_COMPILE} ` +
  "overleaf compiles on Overleaf's own servers, exactly as the Recompile button does, with the project's compiler and TeX Live version from Overleaf's settings and the account's plan deciding the time limit. It compiles what is in Overleaf now, so local edits count only after push_changes, and without mainTexFile it uses the main document set in Overleaf's menu; draft and stopOnFirstError apply to it only. Its output.pdf and output.log are saved to the same build directory, replacing the previous compile's, and the reply gives both paths. " +
  "Returns a verdict line, then errors, then warnings, including BibTeX's and biber's for overleaf, then the output paths.";
