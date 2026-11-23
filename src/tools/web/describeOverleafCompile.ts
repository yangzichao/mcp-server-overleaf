import { collectLatexDiagnostics } from "../../latex/collectLatexDiagnostics.js";
import { explainCompileStatus, type OverleafCompileResult } from "../../overleaf/web/overleafCompile.js";

/**
 * The report compile_project gives for a compile on Overleaf's servers: a verdict first, then
 * errors and warnings from the log, in the same shape it uses for a local compile.
 */

const MAXIMUM_REPORTED_WARNINGS = 15;
const LOG_TAIL_LINES = 30;

export interface SavedCompileOutput {
  /** The output's name on Overleaf, such as "output.bbl". */
  readonly name: string;
  readonly path: string;
  readonly size: string;
}

export interface OverleafCompileReport {
  readonly result: OverleafCompileResult;
  readonly log: string | undefined;
  /** output.blg, which BibTeX or biber leave when they ran. */
  readonly bibliographyLog?: string | undefined;
  /** Every output saved on this computer, in the order they are reported. */
  readonly saved: readonly SavedCompileOutput[];
}

/** What each kept output is, for a reader who has not met Overleaf's output names. */
function describeSavedOutput(output: SavedCompileOutput): string {
  switch (output.name) {
    case "output.pdf":
      return `Saved the PDF (${output.size}) to ${output.path}.`;
    case "output.log":
      return `Saved the log to ${output.path}.`;
    case "output.bbl":
      return `Saved the bibliography BibTeX or Biber wrote (output.bbl) to ${output.path}.`;
    case "output.blg":
      return `Saved the BibTeX or Biber log (output.blg) to ${output.path}.`;
    case "output.synctex.gz":
      return `Saved the SyncTeX map from PDF positions to source lines (output.synctex.gz) to ${output.path}.`;
    default:
      return `Saved ${output.name} to ${output.path}.`;
  }
}

function describeVerdict(result: OverleafCompileResult, errorCount: number): string {
  const hasPdf = result.outputFiles.some((file) => file.path === "output.pdf");
  if (result.status === "success" && hasPdf) {
    return errorCount > 0
      ? `Compiled on Overleaf with ${errorCount} error${errorCount === 1 ? "" : "s"}; a PDF was still produced.`
      : "Compiled on Overleaf.";
  }
  if (result.status === "stopped-on-first-error")
    return "FAILED to compile on Overleaf: stopped at the first error.";
  if (result.status === "failure" || (result.status === "success" && !hasPdf)) {
    return "FAILED to compile on Overleaf: no PDF was produced.";
  }
  const explanation = explainCompileStatus(result.status);
  return `Overleaf did not compile the project (status "${result.status}").${explanation ? ` ${explanation}` : ""}`;
}

export function describeOverleafCompile(report: OverleafCompileReport): string {
  const diagnostics = collectLatexDiagnostics(
    [report.log, report.bibliographyLog].filter((log) => log !== undefined).join("\n"),
  );
  const lines = [describeVerdict(report.result, diagnostics.errorLines.length)];

  if (diagnostics.errorLines.length > 0) {
    lines.push("", "errors:", ...diagnostics.errorLines.map((line) => `  ${line}`));
  }
  if (diagnostics.warningLines.length > 0) {
    const reported = diagnostics.warningLines.slice(0, MAXIMUM_REPORTED_WARNINGS);
    lines.push("", "warnings:", ...reported.map((line) => `  ${line}`));
    if (diagnostics.warningLines.length > reported.length) {
      lines.push(`  … and ${diagnostics.warningLines.length - reported.length} more`);
    }
  }
  const failed = report.result.status !== "success" || diagnostics.errorLines.length > 0;
  if (failed && report.log && diagnostics.errorLines.length === 0) {
    lines.push("", "end of log:", report.log.split("\n").slice(-LOG_TAIL_LINES).join("\n"));
  }
  if (report.saved.length > 0) lines.push("", ...report.saved.map(describeSavedOutput));
  if (report.result.outputFiles.length > 0) {
    lines.push("", `Output files: ${report.result.outputFiles.map((file) => file.path).join(", ")}`);
  }
  return lines.join("\n");
}
