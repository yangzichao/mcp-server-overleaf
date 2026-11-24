/**
 * Picks the lines worth reporting out of a LaTeX run's output: errors, and the warnings a
 * reader would act on. Used for latexmk's output locally and for the `output.log` Overleaf's
 * compiler leaves, which follow the same conventions.
 */

export interface LatexDiagnostics {
  readonly errorLines: string[];
  readonly warningLines: string[];
}

const MAXIMUM_REPORTED_DIAGNOSTICS = 40;

/**
 * BibTeX's and biber's own messages, which latexmk passes through and Overleaf keeps in
 * output.blg. A missing .bib file or a malformed entry shows up only here: LaTeX itself
 * just reports every citation as undefined.
 */
const BIBLIOGRAPHY_ERROR_PATTERNS = [
  /^I couldn't open (?:database|style|file name) file/,
  /^I found no \\(?:citation|bibdata|bibstyle) command/,
  /---line \d+ of file /,
  /^(?:\[\d+\] [\w.:]+> )?ERROR - /,
];
const BIBLIOGRAPHY_WARNING_PATTERNS = [/^Warning--/, /^(?:\[\d+\] [\w.:]+> )?WARN - /];

function isLatexError(line: string): boolean {
  // `-file-line-error` renders errors as `file.tex:12: Undefined control sequence`.
  return (
    /^.+\.\w+:\d+:/.test(line) ||
    line.startsWith("! ") ||
    BIBLIOGRAPHY_ERROR_PATTERNS.some((pattern) => pattern.test(line))
  );
}

function isLatexWarning(line: string): boolean {
  return (
    /^(LaTeX|Package|Class)\s.*Warning/.test(line) ||
    line.startsWith("Overfull") ||
    line.startsWith("Underfull") ||
    BIBLIOGRAPHY_WARNING_PATTERNS.some((pattern) => pattern.test(line))
  );
}

export function collectLatexDiagnostics(compilerOutput: string): LatexDiagnostics {
  const errorLines: string[] = [];
  const warningLines: string[] = [];

  for (const line of compilerOutput.split("\n")) {
    if (isLatexError(line)) errorLines.push(line.trim());
    else if (isLatexWarning(line)) warningLines.push(line.trim());
  }

  return {
    errorLines: errorLines.slice(0, MAXIMUM_REPORTED_DIAGNOSTICS),
    warningLines: warningLines.slice(0, MAXIMUM_REPORTED_DIAGNOSTICS),
  };
}
