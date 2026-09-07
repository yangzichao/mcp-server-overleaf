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
