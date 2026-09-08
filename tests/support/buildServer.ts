import { execFileSync } from "node:child_process";
import { accessSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export default function buildServer(): void {
  if (process.env.OVERLEAF_TEST_SERVER_ENTRYPOINT) {
    accessSync(process.env.OVERLEAF_TEST_SERVER_ENTRYPOINT);
    return;
  }
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  // Every Vitest entry point must exercise this checkout's sources, including coverage
  // and focused runs. dist is ignored by git and may be missing or out of date.
  execFileSync("npm", ["run", "build"], { cwd: packageRoot, stdio: "inherit" });
}
