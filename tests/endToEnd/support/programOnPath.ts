import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function isProgramOnPath(program: string): Promise<boolean> {
  try {
    await execFileAsync("which", [program], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}
