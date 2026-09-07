import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export default function buildServer(): void {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  // Every Vitest entry point must exercise this checkout's sources, including coverage
  // and focused runs. dist is ignored by git and may be missing or out of date.
  execFileSync("npm", ["run", "build"], { cwd: packageRoot, stdio: "inherit" });
}
