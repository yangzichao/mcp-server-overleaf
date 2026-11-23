import { collectLatexDiagnostics } from "../../latex/collectLatexDiagnostics.js";
import { explainCompileStatus, type OverleafCompileResult } from "../../overleaf/web/overleafCompile.js";

/**
 * The report compile_project gives for a compile on Overleaf's servers: a verdict first, then
 * errors and warnings from the log, in the same shape it uses for a local compile.
 */

const MAXIMUM_REPORTED_WARNINGS = 15;
const LOG_TAIL_LINES = 30;

export interface OverleafCompileReport {
  readonly result: OverleafCompileResult;
  readonly log: string | undefined;
  /** output.blg, which BibTeX or biber leave when they ran. */
  readonly bibliographyLog?: string | undefined;
  readonly savedPdf: { readonly path: string; readonly size: string } | undefined;
  /** Where output.log was saved, when the compile produced one. */
  readonly savedLogPath?: string | undefined;
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
  const saved: string[] = [];
  if (report.savedPdf) saved.push(`Saved the PDF (${report.savedPdf.size}) to ${report.savedPdf.path}.`);
  if (report.savedLogPath) saved.push(`Saved the log to ${report.savedLogPath}.`);
  if (saved.length > 0) lines.push("", ...saved);
  if (report.result.outputFiles.length > 0) {
    lines.push("", `Output files: ${report.result.outputFiles.map((file) => file.path).join(", ")}`);
  }
  return lines.join("\n");
}
