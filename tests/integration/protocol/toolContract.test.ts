import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeOverleafRemote } from "../fakeOverleafRemote.js";
import { McpStdioClient } from "../mcpStdioClient.js";
import { McpHttpClient } from "../support/mcpHttpClient.js";

const paper =
  "\\documentclass{article}\n\\begin{document}\n\\section{Introduction}\nRepeated. Repeated.\n\\section{Conclusion}\nOriginal ending.\n\\end{document}\n";

describe.each(["stdio", "http"] as const)("MCP contract over %s", (transport) => {
  let remote: FakeOverleafRemote;
  let client: McpStdioClient | McpHttpClient;

  beforeEach(async () => {
    remote = await FakeOverleafRemote.create();
    await remote.collaboratorPushes("main.tex", paper, "Initial draft");
    client = await (transport === "stdio" ? McpStdioClient : McpHttpClient).start(remote.environment());
  });

  afterEach(async () => {
    await client?.stop();
    remote?.cleanUp();
  });

  it("advertises the exact tool catalog, required arguments and write annotations", async () => {
    const tools = await client.listTools();
    const expectedNames = [
      "list_projects",
      "read_project",
      "read_file",
      "search_project",
      "read_history",
      "check_references",
      "look_up_citations",
      "compile_project",
      "edit_file",
      "manage_files",
      "push_changes",
    ];
    expect(tools.map((tool) => tool.name).sort()).toEqual(expectedNames.sort());
    const writes = new Set(["edit_file", "manage_files", "push_changes"]);
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.annotations?.readOnlyHint).toBe(!writes.has(tool.name));
      // Every tool reaches Overleaf except list_projects, which without a session cookie only
      // reports local configuration. Getting this backwards misleads a client about a call's cost.
      expect(tool.annotations?.openWorldHint).toBe(tool.name !== "list_projects");
    }
    expect(tools.find((tool) => tool.name === "edit_file")).toMatchObject({
      inputSchema: { required: ["action", "path"] },
      annotations: { destructiveHint: true, idempotentHint: false },
    });
    expect(tools.find((tool) => tool.name === "push_changes")?.inputSchema.required).toEqual([
      "commitMessage",
    ]);
    expect(tools.find((tool) => tool.name === "manage_files")?.inputSchema.required).toEqual(["action"]);
    // read_project's overview is text now; no tool promises a structured result any more.
    for (const tool of tools) expect(tool.outputSchema, `${tool.name} has an outputSchema`).toBeUndefined();
  });

  it("starts a task with an overview naming the clone, the main document and unpushed files", async () => {
    await client.call("edit_file", { action: "write", path: "refs.bib", content: "@article{key}\n" });
    const overview = await client.call("read_project");

    expect(overview).toMatch(/^Local clone: \/.+/);
    const clonePath = overview.split("\n")[0]?.slice("Local clone: ".length) ?? "";
    expect(clonePath.startsWith(remote.workspaceDirectory)).toBe(true);
    expect(overview).toContain("Likely main document: main.tex, with 2 sectioning commands in that file.");
    expect(overview).toContain("Files: 2 (tex 1, bibliography 1), 1 of them already in Overleaf.");
    expect(overview).toContain("New files not yet pushed: refs.bib");
    expect(overview).not.toContain("Text-only checkout");
  });

  it("describes every tool and every parameter, because an undescribed one is unusable", async () => {
    for (const tool of await client.listTools()) {
      expect(tool.description ?? "", `${tool.name} has no description`).not.toBe("");
      expect(tool.title ?? "", `${tool.name} has no title`).not.toBe("");
      // A doubled backslash in the TypeScript source shows up as \\input, which is not
      // the LaTeX command the description means to name.
      expect(tool.description, `${tool.name} names a LaTeX command with two backslashes`).not.toMatch(
        /\\\\[a-z]/,
      );
      const properties = (tool.inputSchema.properties ?? {}) as Record<string, { description?: string }>;
      for (const [parameterName, schema] of Object.entries(properties)) {
        expect(schema.description ?? "", `${tool.name}.${parameterName} has no description`).not.toBe("");
      }
    }
  });

  it("deletes and moves files locally, and publishes both on push", async () => {
    await client.call("edit_file", { action: "write", path: "obsolete.tex", content: "Old draft.\n" });
    await client.call("push_changes", { commitMessage: "Add a file to remove later" });

    expect(await client.call("manage_files", { action: "delete", path: "absent.tex" })).toContain(
      "nothing to delete",
    );
    expect(await client.call("manage_files", { action: "delete", path: "obsolete.tex" })).toContain(
      "still in Overleaf",
    );
    expect(await remote.readPublishedFile("obsolete.tex")).toBe("Old draft.\n");

    // A deletion is only local until a push, so discarding has to bring the file back.
    await client.call("manage_files", { action: "discard_local_changes" });
    expect(await client.call("read_file", { path: "obsolete.tex" })).toBe("Old draft.\n");

    expect(
      await client.call("manage_files", { action: "move", path: "absent.tex", toPath: "x.tex" }),
    ).toContain("nothing to move");
    expect(
      await client.call("manage_files", { action: "move", path: "obsolete.tex", toPath: "main.tex" }),
    ).toContain("already exists");
    expect(
      await client.call("manage_files", { action: "move", path: "obsolete.tex", toPath: "obsolete.tex" }),
    ).toContain("same file");
    expect(
      await client.call("manage_files", {
        action: "move",
        path: "obsolete.tex",
        toPath: "sections/renamed.tex",
      }),
    ).toContain("Moved obsolete.tex");

    await client.call("manage_files", { action: "delete", path: "sections/renamed.tex" });
    await client.call("edit_file", { action: "write", path: "kept.tex", content: "Kept.\n" });
    await client.call("push_changes", { commitMessage: "Remove the obsolete draft" });
    expect(await remote.listPublishedFiles()).not.toContain("obsolete.tex");
    expect(await remote.readPublishedFile("kept.tex")).toBe("Kept.\n");
  });

  it("refuses to move a file outside the project", async () => {
    const response = await client.callRaw("manage_files", {
      action: "move",
      path: "main.tex",
      toPath: "../escaped.tex",
    });
    expect(response.result?.isError === true || response.error !== undefined).toBe(true);
    expect(await client.call("read_file", { path: "main.tex" })).toBe(paper);
  });

  it("lists projects and files, reads ranges and sections, and searches", async () => {
    expect(await client.call("list_projects")).toContain("paper  (default)");
    expect(await client.call("read_project", { view: "files" })).toContain("main.tex");
    expect(await client.call("read_file", { path: "main.tex", startLine: 3, endLine: 4 })).toBe(
      "3\t\\section{Introduction}\n4\tRepeated. Repeated.",
    );
    expect(await client.call("read_project", { view: "outline", path: "main.tex" })).toContain("Conclusion");
    expect(await client.call("read_file", { path: "main.tex", sectionTitle: "Conclusion" })).toContain(
      "Original ending.",
    );
    expect(await client.call("search_project", { query: "Repeated", maximumMatches: 1 })).toContain(
      "main.tex:4:",
    );
    expect(await client.call("read_project", { view: "status" })).toContain(
      "commits on Overleaf not yet merged in: 0",
    );
    expect(await client.call("read_project", { view: "status" })).toContain(
      "local commits not yet pushed: 0",
    );
  });

  it("rejects invalid arguments before changing a project", async () => {
    for (const [name, argumentsValue] of [
      ["edit_file", { action: "write", content: "Must not be written" }],
      ["read_file", { path: "main.tex", startLine: 0 }],
      ["search_project", { query: "x", maximumMatches: 501 }],
    ] as const) {
      const response = await client.callRaw(name, argumentsValue);
      expect(response.result?.isError === true || response.error !== undefined).toBe(true);
    }
    expect(await client.call("read_project", { view: "changes" })).toBe("No local changes pending.");
    expect(await remote.readPublishedFile("main.tex")).toBe(paper);
  });

  it("reports a tool-level file error and remains usable for the next request", async () => {
    const response = await client.callRaw("read_file", { path: "missing.tex" });
    expect(response.error).toBeUndefined();
    expect(response.result).toMatchObject({ isError: true, content: [{ type: "text" }] });
    expect(await client.call("read_file", { path: "main.tex" })).toBe(paper);
  });

  it("keeps ambiguous edits unchanged and publishes a reviewed section and new file", async () => {
    expect(
      await client.call("edit_file", {
        action: "replace_text",
        path: "main.tex",
        findText: "Repeated.",
        replaceWith: "Changed.",
      }),
    ).toContain("Nothing was changed");
    expect(await client.call("read_project", { view: "changes" })).toBe("No local changes pending.");
    await client.call("edit_file", {
      action: "replace_text",
      path: "main.tex",
      findText: "Repeated.",
      replaceWith: "Changed.",
      replaceAll: true,
    });
    await client.call("edit_file", {
      action: "replace_section",
      path: "main.tex",
      sectionTitle: "Conclusion",
      content: "\\section{Conclusion}\nReviewed ending.",
    });
    await client.call("edit_file", { action: "write", path: "notes.tex", content: "New notes.\n" });
    expect(await client.call("compile_project", { mainTexFile: "notes.tex" })).toContain(
      "no \\begin{document}",
    );
    expect(await client.call("read_project", { view: "changes" })).toContain("+New notes.");
    expect(await remote.readPublishedFile("main.tex")).toBe(paper);
    expect(await client.call("push_changes", { commitMessage: "Reviewed paper" })).toContain("Pushed");
    const published = await remote.readPublishedFile("main.tex");
    expect(published).toContain("Changed. Changed.");
    expect(published).toContain("Reviewed ending.");
    expect(published).toContain("\\end{document}");
    expect(await remote.readPublishedFile("notes.tex")).toBe("New notes.\n");
    expect(await client.call("read_project", { view: "changes" })).toBe("No local changes pending.");
    await client.call("edit_file", { action: "write", path: "notes.tex", content: "Unwanted edit" });
    await client.call("manage_files", { action: "discard_local_changes" });
    expect(await client.call("read_file", { path: "notes.tex" })).toBe("New notes.\n");
  });
});
