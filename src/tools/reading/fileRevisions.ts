import { createHash } from "node:crypto";

export function fileRevision(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function requireFileRevision(content: string, expectedRevision: string | undefined): void {
  if (expectedRevision !== undefined && fileRevision(content) !== expectedRevision) {
    throw new Error(
      "File changed since the supplied revision. Nothing was written. Read the current file and review the edit again.",
    );
  }
}

export type RevisionReadResult =
  | { kind: "full"; revision: string | null; content: string; truncated: boolean }
  | { kind: "unchanged"; revision: string }
  | {
      kind: "delta";
      revision: string;
      baseRevision: string;
      change: { startLine: number; deleteLineCount: number; lines: string[] };
    };

/** Bounded per-process snapshots. Every caller supplies its own baseline; no shared last-read pointer. */
export class FileRevisionStore {
  private readonly snapshots = new Map<string, string>();
  private storedCharacters = 0;

  constructor(
    private readonly maximumCharacters = 2_000_000,
    private readonly maximumEntries = 128,
  ) {}

  read(scope: string, content: string, previousRevision?: string): RevisionReadResult {
    // A truncated response must never become a baseline that the caller believes it has in full.
    if (JSON.stringify({ content }).length > 50_000) {
      return { kind: "full", revision: null, content: content.slice(0, 8_000), truncated: true };
    }
    const revision = fileRevision(content);
    const previous = previousRevision
      ? this.snapshots.get(JSON.stringify([scope, previousRevision]))
      : undefined;
    this.remember(JSON.stringify([scope, revision]), content);
    if (previous === undefined) return { kind: "full", revision, content, truncated: false };
    if (previous === content) return { kind: "unchanged", revision };

    const oldLines = previous.split("\n");
    const newLines = content.split("\n");
    let sharedPrefix = 0;
    while (
      sharedPrefix < oldLines.length &&
      sharedPrefix < newLines.length &&
      oldLines[sharedPrefix] === newLines[sharedPrefix]
    )
      sharedPrefix++;
    let sharedSuffix = 0;
    while (
      sharedSuffix < oldLines.length - sharedPrefix &&
      sharedSuffix < newLines.length - sharedPrefix &&
      oldLines[oldLines.length - sharedSuffix - 1] === newLines[newLines.length - sharedSuffix - 1]
    )
      sharedSuffix++;
    const delta: RevisionReadResult = {
      kind: "delta",
      revision,
      baseRevision: previousRevision as string,
      change: {
        startLine: sharedPrefix + 1,
        deleteLineCount: oldLines.length - sharedPrefix - sharedSuffix,
        lines: newLines.slice(sharedPrefix, newLines.length - sharedSuffix),
      },
    };
    const full: RevisionReadResult = { kind: "full", revision, content, truncated: false };
    return JSON.stringify(delta).length < JSON.stringify(full).length ? delta : full;
  }

  private remember(key: string, content: string): void {
    const existing = this.snapshots.get(key);
    if (existing !== undefined) {
      this.storedCharacters -= existing.length;
      this.snapshots.delete(key);
    }
    this.snapshots.set(key, content);
    this.storedCharacters += content.length;
    while (this.storedCharacters > this.maximumCharacters || this.snapshots.size > this.maximumEntries) {
      const oldest = this.snapshots.entries().next().value;
      if (!oldest) break;
      this.snapshots.delete(oldest[0]);
      this.storedCharacters -= oldest[1].length;
    }
  }
}
