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
      "list_files",
      "read_file",
      "list_sections",
      "read_section",
      "search_project",
      "replace_text",
      "edit_section",
      "write_file",
      "show_diff",
      "discard_local_changes",
      "project_status",
      "project_summary",
      "sync_project",
      "compile_project",
      "push_changes",
      "delete_file",
      "move_file",
    ];
    expect(tools.map((tool) => tool.name).sort()).toEqual(expectedNames.sort());
    const writes = new Set([
      "replace_text",
      "edit_section",
      "write_file",
      "delete_file",
      "move_file",
      "discard_local_changes",
      "sync_project",
      "push_changes",
    ]);
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.annotations?.readOnlyHint).toBe(!writes.has(tool.name));
      // Every tool reaches Overleaf except list_projects, which only reports local
      // configuration. Getting this backwards misleads a client about what a call costs.
      expect(tool.annotations?.openWorldHint).toBe(tool.name !== "list_projects");
    }
    expect(tools.find((tool) => tool.name === "write_file")).toMatchObject({
      inputSchema: { required: ["path", "content"] },
      annotations: { destructiveHint: true, idempotentHint: true },
    });
    expect(tools.find((tool) => tool.name === "push_changes")?.inputSchema.required).toEqual([
      "commitMessage",
    ]);
    expect(tools.find((tool) => tool.name === "move_file")?.inputSchema.required).toEqual([
      "fromPath",
      "toPath",
    ]);
    expect(tools.find((tool) => tool.name === "project_summary")?.outputSchema).toMatchObject({
      type: "object",
    });
  });

  it("describes every tool and every parameter, because an undescribed one is unusable", async () => {
    for (const tool of await client.listTools()) {
      expect(tool.description ?? "", `${tool.name} has no description`).not.toBe("");
      expect(tool.title ?? "", `${tool.name} has no title`).not.toBe("");
      const properties = (tool.inputSchema.properties ?? {}) as Record<string, { description?: string }>;
      for (const [parameterName, schema] of Object.entries(properties)) {
        expect(schema.description ?? "", `${tool.name}.${parameterName} has no description`).not.toBe("");
      }
    }
  });

  it("deletes and moves files locally, and publishes both on push", async () => {
    await client.call("write_file", { path: "obsolete.tex", content: "Old draft.\n" });
    await client.call("push_changes", { commitMessage: "Add a file to remove later" });

    expect(await client.call("delete_file", { path: "absent.tex" })).toContain("nothing to delete");
    expect(await client.call("delete_file", { path: "obsolete.tex" })).toContain("still in Overleaf");
    expect(await remote.readPublishedFile("obsolete.tex")).toBe("Old draft.\n");

    // A deletion is only local until a push, so discarding has to bring the file back.
    await client.call("discard_local_changes");
    expect(await client.call("read_file", { path: "obsolete.tex" })).toBe("Old draft.\n");

    expect(await client.call("move_file", { fromPath: "absent.tex", toPath: "x.tex" })).toContain(
      "nothing to move",
    );
    expect(await client.call("move_file", { fromPath: "obsolete.tex", toPath: "main.tex" })).toContain(
      "already exists",
    );
    expect(await client.call("move_file", { fromPath: "obsolete.tex", toPath: "obsolete.tex" })).toContain(
      "same file",
    );
    expect(
      await client.call("move_file", { fromPath: "obsolete.tex", toPath: "sections/renamed.tex" }),
    ).toContain("Moved obsolete.tex");

    await client.call("delete_file", { path: "sections/renamed.tex" });
    await client.call("write_file", { path: "kept.tex", content: "Kept.\n" });
    await client.call("push_changes", { commitMessage: "Remove the obsolete draft" });
    expect(await remote.listPublishedFiles()).not.toContain("obsolete.tex");
    expect(await remote.readPublishedFile("kept.tex")).toBe("Kept.\n");
  });

  it("refuses to move a file outside the project", async () => {
    const response = await client.callRaw("move_file", {
      fromPath: "main.tex",
      toPath: "../escaped.tex",
    });
    expect(response.result?.isError === true || response.error !== undefined).toBe(true);
    expect(await client.call("read_file", { path: "main.tex" })).toBe(paper);
  });

  it("lists projects and files, reads ranges and sections, and searches", async () => {
    expect(await client.call("list_projects")).toContain("paper  (default)");
    expect(await client.call("list_files")).toContain("main.tex");
    expect(await client.call("read_file", { path: "main.tex", startLine: 3, endLine: 4 })).toBe(
      "3\t\\section{Introduction}\n4\tRepeated. Repeated.",
    );
    expect(await client.call("list_sections", { path: "main.tex" })).toContain("Conclusion");
    expect(await client.call("read_section", { path: "main.tex", sectionTitle: "Conclusion" })).toContain(
      "Original ending.",
    );
    expect(await client.call("search_project", { query: "Repeated", maximumMatches: 1 })).toContain(
      "main.tex:4:",
    );
    expect(await client.call("sync_project")).toContain("Up to date");
    expect(await client.call("project_status")).toContain("local commits not yet pushed: 0");
  });

  it("rejects invalid arguments before changing a project", async () => {
    for (const [name, argumentsValue] of [
      ["write_file", { content: "Must not be written" }],
      ["read_file", { path: "main.tex", startLine: 0 }],
      ["search_project", { query: "x", maximumMatches: 501 }],
    ] as const) {
      const response = await client.callRaw(name, argumentsValue);
      expect(response.result?.isError === true || response.error !== undefined).toBe(true);
    }
    expect(await client.call("show_diff")).toBe("No local changes pending.");
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
      await client.call("replace_text", { path: "main.tex", findText: "Repeated.", replaceWith: "Changed." }),
    ).toContain("Nothing was changed");
    expect(await client.call("show_diff")).toBe("No local changes pending.");
    await client.call("replace_text", {
      path: "main.tex",
      findText: "Repeated.",
      replaceWith: "Changed.",
      replaceAll: true,
    });
    await client.call("edit_section", {
      path: "main.tex",
      sectionTitle: "Conclusion",
      newContent: "\\section{Conclusion}\nReviewed ending.",
    });
    await client.call("write_file", { path: "notes.tex", content: "New notes.\n" });
    expect(await client.call("compile_project", { mainTexFile: "notes.tex" })).toContain(
      "no \\begin{document}",
    );
    expect(await client.call("show_diff")).toContain("+New notes.");
    expect(await remote.readPublishedFile("main.tex")).toBe(paper);
    expect(await client.call("push_changes", { commitMessage: "Reviewed paper" })).toContain("Pushed");
    const published = await remote.readPublishedFile("main.tex");
    expect(published).toContain("Changed. Changed.");
    expect(published).toContain("Reviewed ending.");
    expect(published).toContain("\\end{document}");
    expect(await remote.readPublishedFile("notes.tex")).toBe("New notes.\n");
    expect(await client.call("show_diff")).toBe("No local changes pending.");
    await client.call("write_file", { path: "notes.tex", content: "Unwanted edit" });
    await client.call("discard_local_changes");
    expect(await client.call("read_file", { path: "notes.tex" })).toBe("New notes.\n");
  });
});
