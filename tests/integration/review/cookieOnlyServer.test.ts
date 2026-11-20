import { describe, expect, it } from "vitest";

import { useEditorTestHarness } from "../support/editorTestHarness.js";

/**
 * A plan without Git integration has no Git token to give. With only the session cookie, the
 * editor and web tools must still reach the project, and the Git-bridge tools, which could only
 * answer with a setup note, are not offered.
 */

describe("a server configured with only a session cookie", () => {
  const harness = useEditorTestHarness();

  function cookieOnlyEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    return {
      OVERLEAF_SESSION_COOKIE: harness.editor.cookieHeader,
      OVERLEAF_WEB_BASE_URL: harness.editor.baseUrl,
      OVERLEAF_MCP_WORKSPACE_DIR: harness.gitRemote.workspaceDirectory,
      // Keeps the per-user projects.json of whoever runs the tests out of it.
      XDG_CONFIG_HOME: harness.gitRemote.workspaceDirectory,
      ...overrides,
    };
  }

  it("offers the editor tools and list_projects, and none of the Git-bridge tools", async () => {
    const client = await harness.startClient(cookieOnlyEnvironment());
    const names = await client.listToolNames();
    expect(names).toContain("list_projects");
    expect(names).toContain("list_tracked_changes");
    expect(names).toContain("download_project_zip");
    expect(names).not.toContain("read_file");
    expect(names).not.toContain("push_changes");
    expect(names).toHaveLength(14);
  });

  it("reaches a project named by its address", async () => {
    const client = await harness.startClient(cookieOnlyEnvironment());
    const answer = await client.call("list_tracked_changes", {
      project: `https://www.overleaf.com/project/${harness.gitRemote.projectId}`,
      path: "main.tex",
    });
    expect(answer).toContain("No tracked changes in main.tex.");
  });

  it("reaches a project registered with no Git token, as the default", async () => {
    const client = await harness.startClient(
      cookieOnlyEnvironment({ OVERLEAF_PROJECTS: `paper=${harness.gitRemote.projectId}` }),
    );
    expect(await client.call("list_projects")).toContain("paper  (default)");
    const answer = await client.call("list_tracked_changes", { path: "main.tex" });
    expect(answer).toContain("No tracked changes in main.tex.");
  });

  it("tells the model it has no Git bridge rather than to push", async () => {
    const client = await harness.startClient(cookieOnlyEnvironment());
    const instructions = client.serverInstructions ?? "";
    expect(instructions).toContain("No Git credential is configured");
    expect(instructions).not.toContain("push_changes");
    const toolNames = new Set(await client.listToolNames());
    for (const named of instructions.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? []) {
      expect(toolNames, `instructions name ${named}`).toContain(named);
    }
  });
});
