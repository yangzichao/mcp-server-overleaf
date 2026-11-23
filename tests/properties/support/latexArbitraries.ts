import fc from "fast-check";

/** Pieces that exercise what LaTeX parsing gets wrong: escapes, braces, comments, math, non-BMP text. */
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

/** One line of LaTeX-ish text, never containing a newline. */
export const latexLine: fc.Arbitrary<string> = fc
  .array(latexFragment, { maxLength: 12 })
  .map((fragments) => fragments.join("").replaceAll("\n", " "));

/** Several LaTeX-ish lines joined by newlines, possibly empty. */
export const latexDocument: fc.Arbitrary<string> = fc
  .array(latexLine, { maxLength: 15 })
  .map((lines) => lines.join("\n"));

/** Text that may hold newlines anywhere, including inside what would be a command. */
export const latexText: fc.Arbitrary<string> = fc
  .array(fc.oneof(latexFragment, fc.constantFrom("\n", "\r\n")), { maxLength: 30 })
  .map((fragments) => fragments.join(""));
