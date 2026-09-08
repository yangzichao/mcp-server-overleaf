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
    ];
    expect(tools.map((tool) => tool.name).sort()).toEqual(expectedNames.sort());
    const writes = new Set([
      "replace_text",
      "edit_section",
      "write_file",
      "discard_local_changes",
      "sync_project",
      "push_changes",
    ]);
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.annotations?.readOnlyHint).toBe(!writes.has(tool.name));
    }
    expect(tools.find((tool) => tool.name === "write_file")).toMatchObject({
      inputSchema: { required: ["path", "content"] },
      annotations: { destructiveHint: true, idempotentHint: true },
    });
    expect(tools.find((tool) => tool.name === "push_changes")?.inputSchema.required).toEqual([
      "commitMessage",
    ]);
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
