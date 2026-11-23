import fc from "fast-check";

const LATEX_FRAGMENTS = [
  "\\",
  "\\\\",
  "{",
  "}",
  "[",
  "]",
  "%",
  "\\%",
  "% a comment",
  "$",
  "$$x$$",
  "$&",
  " ",
  "\t",
  ",",
  "=",
  "word",
  "Intro",
  "é",
  "北京",
  "𝔸",
  "😀",
  "\\emph{x}",
  "\\section{Intro}",
  "\\cite{key}",
  "\\label{sec:a}",
  "\\begin{verbatim}",
  "\\end{verbatim}",
  "\\begin{comment}",
  "\\end{comment}",
  "\\end{document}",
] as const;

export const latexFragment: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom(...LATEX_FRAGMENTS) },
  { weight: 1, arbitrary: fc.string({ maxLength: 3 }) },
);

export const latexLine: fc.Arbitrary<string> = fc
  .array(latexFragment, { maxLength: 12 })
  .map((fragments) => fragments.join("").replaceAll("\n", " "));

export const latexDocument: fc.Arbitrary<string> = fc
  .array(latexLine, { maxLength: 15 })
  .map((lines) => lines.join("\n"));

export const latexTextWithLineBreaksAnywhere: fc.Arbitrary<string> = fc
  .array(fc.oneof(latexFragment, fc.constantFrom("\n", "\r\n")), { maxLength: 30 })
  .map((fragments) => fragments.join(""));
