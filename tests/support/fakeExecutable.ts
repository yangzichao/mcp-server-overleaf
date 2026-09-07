import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** A real subprocess with deterministic behavior, requiring no network or TeX install. */
export async function writeFakeExecutable(
  directory: string,
  name: string,
  javascript: string,
): Promise<void> {
  await mkdir(directory, { recursive: true });
  const executablePath = join(directory, name);
  await writeFile(executablePath, `#!${process.execPath}\n${javascript}\n`);
  await chmod(executablePath, 0o755);
}
