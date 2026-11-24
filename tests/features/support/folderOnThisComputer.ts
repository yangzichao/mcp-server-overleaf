import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export class FolderOnThisComputer {
  private constructor(readonly path: string) {}

  static create(): FolderOnThisComputer {
    return new FolderOnThisComputer(mkdtempSync(join(tmpdir(), "overleaf-feature-folders-")));
  }

  pathOf(relativePath: string): string {
    return join(this.path, ...relativePath.split("/"));
  }

  writeFile(relativePath: string, content: string | Buffer): void {
    const absolutePath = this.pathOf(relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
  }

  linkTo(relativePath: string, target: string): void {
    const absolutePath = this.pathOf(relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    symlinkSync(target, absolutePath);
  }

  readBytes(relativePath: string): Buffer {
    return readFileSync(this.pathOf(relativePath));
  }

  remove(): void {
    rmSync(this.path, { recursive: true, force: true });
  }
}
