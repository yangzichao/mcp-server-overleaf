import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RevisionReadResult } from "../../../src/tools/reading/fileRevisions.js";
import { FakeOverleafRemote } from "../fakeOverleafRemote.js";
import { McpStdioClient } from "../mcpStdioClient.js";
import { McpHttpClient } from "../support/mcpHttpClient.js";

const paper = `\\section{Introduction}\n${Array.from({ length: 100 }, (_, index) => `Line ${index}`).join("\n")}\n`;

function reconstruct(previous: string, response: RevisionReadResult): string {
  if (response.kind === "full") return response.content;
  if (response.kind === "unchanged") return previous;
  const lines = previous.split("\n");
  lines.splice(response.change.startLine - 1, response.change.deleteLineCount, ...response.change.lines);
  return lines.join("\n");
}

describe.each(["stdio", "http"] as const)("Git feature parity over %s", (transport) => {
  let remote: FakeOverleafRemote;
  let client: McpStdioClient | McpHttpClient;
  const clientType = transport === "stdio" ? McpStdioClient : McpHttpClient;

  beforeEach(async () => {
    remote = await FakeOverleafRemote.create();
    await remote.collaboratorPushes("main.tex", paper, "Initial draft");
    client = await clientType.start(remote.environment());
  });
  afterEach(async () => {
    await client?.stop();
    remote?.cleanUp();
  });

  it("returns deltas against the caller's baseline after several remote and local changes", async () => {
    const first = JSON.parse(
      await client.call("read_file", { path: "main.tex", mode: "smart" }),
    ) as RevisionReadResult;
    expect(first.kind).toBe("full");
    await remote.collaboratorPushes("main.tex", paper.replace("Line 20\n", "First change\n"), "First change");
    const middle = JSON.parse(
      await client.call("read_file", { path: "main.tex", mode: "full" }),
    ) as RevisionReadResult;
    const latest = paper.replace("Line 20\n", "First change\n").replace("Line 50\n", "Second change\n");
    await remote.collaboratorPushes("main.tex", latest, "Second change");
    const delta = JSON.parse(
      await client.call("read_file", { path: "main.tex", mode: "smart", previousRevision: first.revision }),
    ) as RevisionReadResult;
    expect(delta.kind).toBe("delta");
    expect(reconstruct(paper, delta)).toBe(latest);
    const secondCaller = JSON.parse(
      await client.call("read_file", { path: "main.tex", mode: "smart", previousRevision: middle.revision }),
    ) as RevisionReadResult;
    expect(reconstruct(reconstruct(paper, middle), secondCaller)).toBe(latest);
    await client.call("replace_text", {
      path: "main.tex",
      findText: "Line 60\n",
      replaceWith: "Local change\n",
      expectedRevision: delta.revision,
    });
    const local = JSON.parse(
      await client.call("read_file", { path: "main.tex", mode: "smart", previousRevision: delta.revision }),
    ) as RevisionReadResult;
    expect(reconstruct(latest, local)).toContain("Local change");
    expect(await remote.readPublishedFile("main.tex")).toBe(latest);
  });

  it("does not suppress content for a caller without a baseline, or after a restart", async () => {
    const first = JSON.parse(await client.call("read_file", { path: "main.tex", mode: "smart" }));
    expect(
      JSON.parse(
        await client.call("read_file", { path: "main.tex", mode: "smart", previousRevision: first.revision }),
      ).kind,
    ).toBe("unchanged");
    expect(JSON.parse(await client.call("read_file", { path: "main.tex", mode: "smart" })).content).toBe(
      paper,
    );
    await client.stop();
    client = await clientType.start(remote.environment());
    expect(
      JSON.parse(
        await client.call("read_file", { path: "main.tex", mode: "smart", previousRevision: first.revision }),
      ).content,
    ).toBe(paper);
  });

  it("refuses stale revisions for whole-file, exact-text and section edits", async () => {
    const first = JSON.parse(await client.call("read_file", { path: "main.tex", mode: "full" }));
    const latest = `${paper}Collaborator addition\n`;
    await remote.collaboratorPushes("main.tex", latest, "Collaborator edit");
    for (const [name, argumentsValue] of [
      ["write_file", { content: "Must not overwrite" }],
      ["replace_text", { findText: "Line 20", replaceWith: "Must not replace" }],
      ["edit_section", { sectionTitle: "Introduction", newContent: "Must not replace section" }],
    ] as const) {
      const response = await client.callRaw(name, {
        ...argumentsValue,
        path: "main.tex",
        expectedRevision: first.revision,
      });
      expect(response.result?.isError).toBe(true);
    }
    expect(await client.call("read_file", { path: "main.tex" })).toBe(latest);
    expect(await client.call("show_diff")).toBe("No local changes pending.");
  });

  it("filters extensions, includes local new files on request, and reports a structured summary", async () => {
    await remote.collaboratorPushes("refs.BIB", "@article{key}\n", "Bibliography");
    await client.call("write_file", { path: "notes.tex", content: "New notes" });
    expect(await client.call("list_files", { extension: ".bib" })).toContain("refs.BIB");
    expect(await client.call("list_files", { extension: "tex" })).not.toContain("refs.BIB");
    expect(await client.call("list_files", { extension: "tex" })).not.toContain("notes.tex");
    expect(await client.call("list_files", { extension: "tex", includeUntracked: true })).toContain(
      "notes.tex (untracked)",
    );
    const summary = JSON.parse(await client.call("project_summary"));
    expect(summary).toMatchObject({
      totalFiles: 3,
      trackedFiles: 2,
      mainFile: "main.tex",
      totalSections: 1,
      untrackedFiles: ["notes.tex"],
    });
    expect(summary.categories).toEqual({ tex: 2, bibliography: 1 });
  });

  it("uses project token files without a global token, including selection by raw id", async () => {
    await client.stop();
    const tokenFile = join(remote.rootDirectory, "private token");
    const configurationFile = join(remote.rootDirectory, "private projects.json");
    await writeFile(tokenFile, "project-private-secret\n", { mode: 0o600 });
    await writeFile(
      configurationFile,
      JSON.stringify({
        projects: { default: { name: "Main Paper", projectId: remote.projectId, gitTokenFile: tokenFile } },
      }),
      { mode: 0o600 },
    );
    client = await clientType.start({
      ...remote.environment(),
      OVERLEAF_GIT_TOKEN: "",
      OVERLEAF_PROJECTS: "",
      OVERLEAF_PROJECTS_CONFIG: configurationFile,
    });
    expect(await client.call("list_projects")).toContain("Main Paper");
    expect(await client.call("read_file", { project: remote.projectId, path: "main.tex" })).toBe(paper);
    expect(
      (await client.callRaw("read_file", { project: "ffffffffffffffffffffffff", path: "main.tex" })).result
        ?.isError,
    ).toBe(true);
    expect(
      await readFile(join(remote.workspaceDirectory, remote.projectId, ".git/config"), "utf8"),
    ).not.toContain("project-private-secret");
  });
});
