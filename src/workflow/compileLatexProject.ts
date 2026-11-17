import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { promisify } from "node:util";

import { collectLatexDiagnostics } from "../latex/collectLatexDiagnostics.js";
import { readFinalCompileLog } from "./readFinalCompileLog.js";

const execFileAsync = promisify(execFile);

export interface CompileResult {
  readonly succeeded: boolean;
  readonly mainTexFile: string;
  readonly errorLines: string[];
  readonly warningLines: string[];
  readonly tailOfLog: string;
}

const MAXIMUM_REPORTED_DIAGNOSTICS = 40;

/**
 * Compiles the project with latexmk into a build directory outside the clone, so
 * build artifacts never end up staged and pushed back to Overleaf.
 */
export async function compileLatexProject(options: {
  repositoryDirectory: string;
  buildDirectory: string;
  mainTexFile: string;
  timeoutMs: number;
}): Promise<CompileResult> {
  const { repositoryDirectory, buildDirectory, mainTexFile, timeoutMs } = options;
  await mkdir(buildDirectory, { recursive: true });

  const latexmkArguments = [
    "-pdf",
    "-interaction=nonstopmode",
    "-file-line-error",
    "-halt-on-error",
    `-outdir=${buildDirectory}`,
    // "./" prefixed, always. latexmk parses any argument starting with a dash as an
    // option, so a file called "-weird.tex" is otherwise rejected as an unknown option
    // rather than compiled, and a name shaped like an option never reaches the parser.
    // The name comes from a model, so it is not ours to trust.
    `./${mainTexFile}`,
  ];

  const startedAtMs = Date.now();
  const finalLog = (succeeded: boolean) =>
    readFinalCompileLog({ buildDirectory, mainTexFile, startedAtMs, succeeded });

  try {
    const { stdout, stderr } = await execFileAsync("latexmk", latexmkArguments, {
      cwd: repositoryDirectory,
      timeout: timeoutMs,
      maxBuffer: 32 * 1024 * 1024,
    });
    const combinedOutput = `${stdout}\n${stderr}`;
    const diagnostics = collectLatexDiagnostics((await finalLog(true)) ?? combinedOutput);
    return {
      succeeded: true,
      mainTexFile,
      errorLines: diagnostics.errorLines,
      warningLines: diagnostics.warningLines,
      tailOfLog: combinedOutput.split("\n").slice(-30).join("\n"),
    };
  } catch (error) {
    const failure = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
      code?: string | number;
      killed?: boolean;
    };
    if (failure.code === "ENOENT") {
      throw new Error(
        "latexmk was not found on PATH. Install a TeX distribution (MacTeX/TeX Live), or compile on Overleaf's servers with compile_on_overleaf, which needs OVERLEAF_SESSION_COOKIE and compiles only what has been pushed.",
      );
    }
    const combinedOutput = `${failure.stdout ?? ""}\n${failure.stderr ?? ""}`;
    const logDiagnostics = collectLatexDiagnostics((await finalLog(false)) ?? "");
    // latexmk can stop before any LaTeX pass runs, and then only its own output says why.
    const diagnostics =
      logDiagnostics.errorLines.length > 0 ? logDiagnostics : collectLatexDiagnostics(combinedOutput);
    if (failure.killed) {
      diagnostics.errorLines.unshift(`Compilation timed out after ${timeoutMs} ms.`);
    } else if (diagnostics.errorLines.length === 0) {
      diagnostics.errorLines.push(`latexmk failed (${failure.code ?? "unknown exit status"}).`);
    }
    return {
      succeeded: false,
      mainTexFile,
      errorLines: diagnostics.errorLines.slice(0, MAXIMUM_REPORTED_DIAGNOSTICS),
      warningLines: diagnostics.warningLines,
      tailOfLog: combinedOutput.split("\n").slice(-40).join("\n"),
    };
  }
}
