import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeOverleafRemote } from "../fakeOverleafRemote.js";
import { McpStdioClient } from "../mcpStdioClient.js";

const PAPER = "\\documentclass{article}\n\\begin{document}\n\\input{sections/intro}\n\\end{document}\n";
const FIGURE_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]);

describe("manage_files on directories of the local clone", () => {
  let remote: FakeOverleafRemote;
  let client: McpStdioClient | undefined;

  beforeEach(async () => {
    remote = await FakeOverleafRemote.create();
    await remote.collaboratorPushes("main.tex", PAPER, "Initial draft");
    await remote.collaboratorPushes("sections/intro.tex", "\\section{Intro}\n", "Intro");
    await remote.collaboratorPushes("sections/method/setup.tex", "\\section{Setup}\n", "Setup");
    await remote.collaboratorPushes("figures/plot.png", FIGURE_BYTES, "A figure");
  });

  afterEach(async () => {
    await client?.stop();
    client = undefined;
    remote.cleanUp();
  });

  const clonePath = (path: string) => join(remote.workspaceDirectory, remote.projectId, path);

  async function start(environment: NodeJS.ProcessEnv = remote.environment()): Promise<McpStdioClient> {
    client = await McpStdioClient.start(environment);
    return client;
  }

  it("deletes a directory with everything in it, and publishes the removal on push", async () => {
    const mcp = await start();
    const answer = await mcp.call("manage_files", { action: "delete", path: "sections" });
    expect(answer).toContain(
      "Deleted the directory sections and the 2 files in it (sections/intro.tex, sections/method/setup.tex) from the local clone.",
    );
    expect(answer).toContain("still in Overleaf");
    expect(await remote.listPublishedFiles()).toContain("sections/intro.tex");

    await mcp.call("push_changes", { commitMessage: "Drop the sections" });
    const published = await remote.listPublishedFiles();
    expect(published).not.toContain("sections/intro.tex");
    expect(published).not.toContain("sections/method/setup.tex");
    expect(published).toContain("main.tex");
  });

  it("moves a directory, creating missing parents, and publishes the new paths", async () => {
    const mcp = await start();
    const answer = await mcp.call("manage_files", {
      action: "move",
      path: "sections",
      toPath: "parts/chapters",
    });
    expect(answer).toContain("Moved the directory sections to parts/chapters, with the 2 files in it");
    expect(answer).toContain("parts/chapters/method/setup.tex");
    expect(answer).toContain("a path under sections/");

    await mcp.call("push_changes", { commitMessage: "Move the sections" });
    expect(await remote.readPublishedFile("parts/chapters/intro.tex")).toBe("\\section{Intro}\n");
    expect(await remote.listPublishedFiles()).not.toContain("sections/intro.tex");
  });

  it("refuses a destination that exists, a move into itself, and a path outside the project", async () => {
    const mcp = await start();
    expect(await mcp.call("manage_files", { action: "move", path: "sections", toPath: "figures" })).toContain(
      "figures already exists. Nothing was moved.",
    );
    const intoItself = await mcp.callRaw("manage_files", {
      action: "move",
      path: "sections",
      toPath: "sections/method/old",
    });
    expect(intoItself.result?.isError).toBe(true);
    expect(intoItself.result?.content?.[0]?.text).toContain("cannot be moved into itself");
    const outsideProject = await mcp.callRaw("manage_files", { action: "delete", path: "../outside" });
    expect(outsideProject.result?.isError).toBe(true);
    const root = await mcp.callRaw("manage_files", { action: "delete", path: "." });
    expect(root.result?.isError).toBe(true);
    expect(existsSync(clonePath("sections/intro.tex"))).toBe(true);
    expect(await mcp.call("read_project", { view: "changes" })).toBe("No local changes pending.");
  });

  it("takes figures that text-only checkout keeps off disk along with their directory", async () => {
    await remote.collaboratorPushes("figures/notes.txt", "Figure notes.\n", "Notes next to the figure");
    const mcp = await start({ ...remote.environment(), OVERLEAF_MCP_CHECKOUT_MODE: "text-only" });
    expect(await mcp.call("read_project", { view: "files" })).toContain("figures/plot.png");
    expect(existsSync(clonePath("figures/plot.png"))).toBe(false);

    const answer = await mcp.call("manage_files", { action: "delete", path: "figures" });
    expect(answer).toContain("the 2 files in it (figures/notes.txt, figures/plot.png)");
    await mcp.call("push_changes", { commitMessage: "Drop the figures" });
    const published = await remote.listPublishedFiles();
    expect(published).not.toContain("figures/plot.png");
    expect(published).not.toContain("figures/notes.txt");
  });

  it("moves a directory whose only files are hidden by text-only checkout", async () => {
    const mcp = await start({ ...remote.environment(), OVERLEAF_MCP_CHECKOUT_MODE: "text-only" });
    const answer = await mcp.call("manage_files", { action: "move", path: "figures", toPath: "images" });
    expect(answer).toContain("with the 1 file in it (images/plot.png)");
    await mcp.call("push_changes", { commitMessage: "Rename the figure folder" });
    expect(await remote.readPublishedBytes("images/plot.png")).toEqual(FIGURE_BYTES);
    expect(await remote.listPublishedFiles()).not.toContain("figures/plot.png");
  });

  it("does not offer create_folder without a session cookie", async () => {
    const mcp = await start();
    const tools = await mcp.listTools();
    const manageFiles = tools.find((tool) => tool.name === "manage_files");
    const action = manageFiles?.inputSchema.properties?.action as { enum?: string[] } | undefined;
    expect(action?.enum).not.toContain("create_folder");
    const response = await mcp.callRaw("manage_files", { action: "create_folder", path: "empty" });
    expect(response.result?.isError === true || response.error !== undefined).toBe(true);
  });
});
