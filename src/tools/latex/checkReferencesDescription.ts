/** The words check_references shares between its clone and editor versions. */

export const CHECK_REFERENCES_TITLE = "Check references, citations and included files";

export const CHECK_REFERENCES_FINDS =
  "Check a LaTeX document's cross-references and citations from its source, without compiling: \\ref, \\eqref, \\cref and similar with no matching \\label; \\cite keys found in no .bib file or \\bibitem; labels and bibliography keys defined twice; and \\input, \\include, \\includegraphics and bibliography files that do not exist. ";

export const CHECK_REFERENCES_GUESSED_ROOT =
  "main.tex, paper.tex or another conventional name at the project root, else the shallowest .tex file";

export const CHECK_REFERENCES_SCOPE =
  "It follows \\input, \\include, \\subfile and \\import from there, and warns when a guessed starting file has no \\begin{document}. A .tex file it never reaches is named in the reply but not checked, and can be checked on its own as mainTexFile. A mainTexFile that does not exist is refused with a list of the .tex files. Comments and verbatim blocks are ignored, and a path or key built from a macro is counted rather than guessed. ";

export const CHECK_REFERENCES_RETURNS =
  "Returns a verdict line with the number of problems, each problem with its file and line, then labels never referenced and bibliography entries never cited, which are worth a look but are not errors.";
