import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export class TemporaryDownloadFolder {
  private constructor(readonly path: string) {}

  static create(): TemporaryDownloadFolder {
    return new TemporaryDownloadFolder(mkdtempSync(join(tmpdir(), "overleaf-feature-downloads-")));
  }

  pathOf(fileName: string): string {
    return join(this.path, fileName);
  }

  remove(): void {
    rmSync(this.path, { recursive: true, force: true });
  }
}
