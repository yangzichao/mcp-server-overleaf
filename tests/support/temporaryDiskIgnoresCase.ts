import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Whether the disk that holds the temporary directory, and so the fake remote's clone, treats
 * "a" and "A" as one name, as macOS does by default.
 */
export function temporaryDiskIgnoresCase(): boolean {
  const probeDirectory = mkdtempSync(join(tmpdir(), "case-probe-"));
  try {
    writeFileSync(join(probeDirectory, "a"), "");
    return existsSync(join(probeDirectory, "A"));
  } finally {
    rmSync(probeDirectory, { recursive: true, force: true });
  }
}
