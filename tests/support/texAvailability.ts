import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function shouldRunTexTests(): Promise<boolean> {
  const mode = process.env.OVERLEAF_TEST_TEX ?? "auto";
  if (mode === "skip") return false;
  if (mode !== "auto" && mode !== "required") throw new Error(`Unknown OVERLEAF_TEST_TEX mode: ${mode}`);
  try {
    await execFileAsync("latexmk", ["-v"], { timeout: 10_000 });
    await execFileAsync("pdflatex", ["--version"], { timeout: 10_000 });
    return true;
  } catch {
    if (mode === "required") throw new Error("TeX tests require latexmk and pdflatex on PATH.");
    return false;
  }
}

/**
 * texcount is optional even when TeX tests are required: CI installs only latexmk and
 * texlive-latex-base, and Debian ships texcount in texlive-extra-utils.
 */
export async function shouldRunTexcountTests(): Promise<boolean> {
  if ((process.env.OVERLEAF_TEST_TEX ?? "auto") === "skip") return false;
  try {
    await execFileAsync("texcount", ["-ver"], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}
