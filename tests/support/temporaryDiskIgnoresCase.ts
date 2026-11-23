import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function temporaryDiskIgnoresCase(): boolean {
  const probeDirectory = mkdtempSync(join(tmpdir(), "case-probe-"));
  try {
    writeFileSync(join(probeDirectory, "a"), "");
    return existsSync(join(probeDirectory, "A"));
  } finally {
    rmSync(probeDirectory, { recursive: true, force: true });
  }
}
