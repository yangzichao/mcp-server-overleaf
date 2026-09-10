import { expect, it } from "vitest";
import { FakeOverleafRemote } from "./fakeOverleafRemote.js";
import { McpStdioClient } from "./mcpStdioClient.js";

const SECOND_PROJECT_ID = "71c4d5e6f7a8b9c0d1e2f3a4";

/**
 * What someone who installed the Claude Desktop bundle can actually do.
 *
 * That bundle asks for one project and sets OVERLEAF_PROJECT_ID, which makes the per-user
 * configuration file unread. Their other papers are still reachable, but only if the tools
 * accept the address bar URL they have and something tells them that is allowed.
 */
async function withBundleStyleClient(
  run: (client: McpStdioClient, remote: FakeOverleafRemote) => Promise<void>,
): Promise<void> {
  const remote = await FakeOverleafRemote.create();
  let client: McpStdioClient | undefined;
  try {
    await remote.collaboratorPushes("main.tex", "The configured paper.\n", "Initial draft");
    await remote.addSiblingProject(SECOND_PROJECT_ID, "main.tex", "The other paper.\n");
    client = await McpStdioClient.start({
      OVERLEAF_GIT_TOKEN: "olp_test_token_not_a_real_secret",
      OVERLEAF_GIT_BASE_URL: remote.gitBaseUrl,
      OVERLEAF_MCP_WORKSPACE_DIR: remote.workspaceDirectory,
      // Exactly what the .mcpb manifest sets, and it is the whole configuration.
      OVERLEAF_PROJECT_ID: `https://www.overleaf.com/project/${remote.projectId}`,
    });
    await run(client, remote);
  } finally {
    await client?.stop();
    remote.cleanUp();
  }
}

it("tells the user their other papers can be named by address", async () => {
  await withBundleStyleClient(async (client) => {
    const listed = await client.call("list_projects");
    expect(listed).toContain("- default  (default)");
    expect(listed).toContain("give its Overleaf address as `project`");
    expect(listed).not.toContain("OVERLEAF_PROJECTS");
  });
});

it("reads a project that was never configured, addressed the way a person copies it", async () => {
  await withBundleStyleClient(async (client) => {
    const content = await client.call("read_file", {
      project: `https://www.overleaf.com/project/${SECOND_PROJECT_ID}`,
      path: "main.tex",
    });
    expect(content).toContain("The other paper.");
  });
});

it("still reads the configured project when no project is named", async () => {
  await withBundleStyleClient(async (client) => {
    expect(await client.call("read_file", { path: "main.tex" })).toContain("The configured paper.");
  });
});

it("names the address as an option when the project cannot be resolved", async () => {
  await withBundleStyleClient(async (client) => {
    const failure = await client.call("read_file", { project: "my other paper", path: "main.tex" });
    expect(failure).toContain("by its Overleaf address");
  });
});
