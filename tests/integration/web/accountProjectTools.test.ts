import { describe, expect, it } from "vitest";

import { useEditorTestHarness } from "../support/editorTestHarness.js";

const WEB_TOOL_NAMES = [
  "list_account_projects",
  "create_project",
  "compile_on_overleaf",
  "download_project_zip",
];

describe("the account project tools", () => {
  const harness = useEditorTestHarness();

  it("are offered only with a session cookie", async () => {
    const withoutCookie = await harness.startClient(harness.gitRemote.environment());
    const namesWithoutCookie = await withoutCookie.listToolNames();
    for (const toolName of WEB_TOOL_NAMES) expect(namesWithoutCookie).not.toContain(toolName);

    const withCookie = await harness.startClient();
    const namesWithCookie = await withCookie.listToolNames();
    for (const toolName of WEB_TOOL_NAMES) expect(namesWithCookie).toContain(toolName);
  });

  it("lists every project in the account with access level and address", async () => {
    const client = await harness.startClient();
    const listed = await client.call("list_account_projects");
    expect(listed).toContain("3 projects in the account:");
    expect(listed).toContain(
      `- Shared Thesis — can edit — ${harness.editor.baseUrl}/project/64b000000000000000000002`,
    );
    expect(listed).toContain("- Grant Proposal — can view —");
    expect(listed).toContain(`${harness.editor.projectId} (registered here as`);
  });

  it("filters by name, case-insensitively", async () => {
    const client = await harness.startClient();
    const listed = await client.call("list_account_projects", { nameContains: "THESIS" });
    expect(listed).toContain("1 project in the account:");
    expect(listed).toContain("Shared Thesis");
    expect(listed).not.toContain("Grant Proposal");

    const none = await client.call("list_account_projects", { nameContains: "nothing like this" });
    expect(none).toContain('No project in the account has "nothing like this" in its name.');
  });

  it("creates a project and returns an address other tools accept", async () => {
    const client = await harness.startClient();
    const answer = await client.call("create_project", { name: "  New Paper  ", template: "example" });
    expect(answer).toMatch(/Created the project "New Paper" at http:\/\/127\.0\.0\.1:\d+\/project\/64c0+2\./);
    expect(harness.editor.web.account.projects.at(-1)?.name).toBe("New Paper (example)");
    const createRequest = harness.editor.web.requests.find((request) => request.path === "/project/new");
    expect(createRequest?.csrfToken).toBe(harness.editor.web.csrfToken);
  });

  it("refuses an empty project name before contacting Overleaf", async () => {
    const client = await harness.startClient();
    const answer = await client.call("create_project", { name: "   " });
    expect(answer).toContain("Input validation error");
    expect(answer).toContain("name: Too small");
    expect(harness.editor.web.requests.some((request) => request.path === "/project/new")).toBe(false);
  });
});
