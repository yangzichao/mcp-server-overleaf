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

export function collectLatexDiagnostics(compilerOutput: string): LatexDiagnostics {
  const errorLines: string[] = [];
  const warningLines: string[] = [];

  for (const line of compilerOutput.split("\n")) {
    // `-file-line-error` renders errors as `file.tex:12: Undefined control sequence`.
    if (/^.+\.\w+:\d+:/.test(line) || line.startsWith("! ")) {
      errorLines.push(line.trim());
    } else if (
      /^(LaTeX|Package|Class)\s.*Warning/.test(line) ||
      line.startsWith("Overfull") ||
      line.startsWith("Underfull")
    ) {
      warningLines.push(line.trim());
    }
  }

  return {
    errorLines: errorLines.slice(0, MAXIMUM_REPORTED_DIAGNOSTICS),
    warningLines: warningLines.slice(0, MAXIMUM_REPORTED_DIAGNOSTICS),
  };
}
