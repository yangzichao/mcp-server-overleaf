import { describe, expect, it } from "vitest";
import {
  FileRevisionStore,
  fileRevision,
  type RevisionReadResult,
} from "../../../src/tools/reading/fileRevisions.js";

function applyRead(previous: string, result: RevisionReadResult): string {
  if (result.kind === "unchanged") return previous;
  if (result.kind === "full") return result.content;
  const lines = previous.split("\n");
  lines.splice(result.change.startLine - 1, result.change.deleteLineCount, ...result.change.lines);
  return lines.join("\n");
}

describe("revision reads", () => {
  const original = Array.from({ length: 100 }, (_, index) => `Line ${index} — 北京`).join("\n");

  it("compares each caller's explicit baseline across several revisions", () => {
    const store = new FileRevisionStore();
    const first = store.read("paper/main.tex", original);
    const middle = original.replace("Line 20", "Intermediate line");
    store.read("paper/main.tex", middle);
    const latest = middle.replace("Line 60", "Latest line");
    store.read("paper/main.tex", latest);
    expect(applyRead(original, store.read("paper/main.tex", latest, first.revision ?? undefined))).toBe(
      latest,
    );
    expect(applyRead(middle, store.read("paper/main.tex", latest, fileRevision(middle)))).toBe(latest);
  });

  it("returns a compact delta for a small edit and an unchanged result for the same baseline", () => {
    const store = new FileRevisionStore();
    store.read("paper/main.tex", original);
    const changed = original.replace("Line 50", "Changed");
    expect(store.read("paper/main.tex", changed, fileRevision(original)).kind).toBe("delta");
    expect(store.read("paper/main.tex", changed, fileRevision(changed))).toEqual({
      kind: "unchanged",
      revision: fileRevision(changed),
    });
  });

  it.each(["", "\n", "line\n", "line\r\n", "💡\n北京", "middle\n\nend"])(
    "reconstructs inserts, deletes and newline boundaries: %j",
    (replacement) => {
      for (const content of [
        replacement + original,
        original + replacement,
        original.replace("Line 50 — 北京", replacement),
        replacement,
      ]) {
        const store = new FileRevisionStore();
        store.read("file", original);
        expect(applyRead(original, store.read("file", content, fileRevision(original)))).toBe(content);
      }
    },
  );

  it("falls back to full for another file, project, missing baseline or restarted process", () => {
    const store = new FileRevisionStore();
    store.read("project-a/main.tex", original);
    for (const scope of ["project-a/other.tex", "project-b/main.tex"]) {
      expect(store.read(scope, `${original}new`, fileRevision(original)).kind).toBe("full");
    }
    expect(new FileRevisionStore().read("project-a/main.tex", original, fileRevision(original)).kind).toBe(
      "full",
    );
  });

  it("evicts old snapshots under both entry and memory limits", () => {
    for (const store of [new FileRevisionStore(10, 128), new FileRevisionStore(2_000_000, 1)]) {
      store.read("first", original);
      store.read("second", "next");
      expect(store.read("first", `${original}new`, fileRevision(original)).kind).toBe("full");
    }
  });

  it("never gives a usable revision for a truncated response", () => {
    const store = new FileRevisionStore();
    const huge = "x".repeat(60_000);
    expect(store.read("file", huge)).toMatchObject({ kind: "full", revision: null, truncated: true });
    expect(store.read("file", "short", fileRevision(huge)).kind).toBe("full");
  });
});
