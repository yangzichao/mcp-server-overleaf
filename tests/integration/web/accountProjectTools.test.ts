import { describe, expect, it } from "vitest";

import { useEditorTestHarness } from "../support/editorTestHarness.js";

describe("the account project tools", () => {
  const harness = useEditorTestHarness();

  it("are offered only with a session cookie", async () => {
    const withoutCookie = await harness.startClient(harness.gitRemote.environment());
    const toolsWithoutCookie = await withoutCookie.listTools();
    expect(toolsWithoutCookie.map((tool) => tool.name)).not.toContain("manage_project");
    const localCompile = toolsWithoutCookie.find((tool) => tool.name === "compile_project");
    expect(localCompile?.inputSchema.properties).not.toHaveProperty("where");

    const withCookie = await harness.startClient();
    const toolsWithCookie = await withCookie.listTools();
    expect(toolsWithCookie.map((tool) => tool.name)).toContain("manage_project");
    const eitherCompile = toolsWithCookie.find((tool) => tool.name === "compile_project");
    expect(eitherCompile?.inputSchema.properties?.where).toMatchObject({ enum: ["local", "overleaf"] });
  });

  it("lists the registered projects before the account's", async () => {
    const client = await harness.startClient();
    const listed = await client.call("list_projects");
    expect(listed.indexOf("- paper  (default)")).toBeLessThan(listed.indexOf("projects in the account:"));
  });

  it("lists every project in the account with access level and address", async () => {
    const client = await harness.startClient();
    const listed = await client.call("list_projects");
    expect(listed).toContain("3 projects in the account:");
    expect(listed).toContain(
      `- Shared Thesis — can edit — ${harness.editor.baseUrl}/project/64b000000000000000000002`,
    );
    expect(listed).toContain("- Grant Proposal — can view —");
    expect(listed).toContain(`${harness.editor.projectId} (registered here as`);
  });

  it("filters by name, case-insensitively", async () => {
    const client = await harness.startClient();
    const listed = await client.call("list_projects", { nameContains: "THESIS" });
    expect(listed).toContain("1 project in the account:");
    expect(listed).toContain("Shared Thesis");
    expect(listed).not.toContain("Grant Proposal");

    const none = await client.call("list_projects", { nameContains: "nothing like this" });
    expect(none).toContain('No project in the account has "nothing like this" in its name.');
  });

  it("creates a project and returns an address other tools accept", async () => {
    const client = await harness.startClient();
    const answer = await client.call("manage_project", {
      action: "create",
      name: "  New Paper  ",
      template: "example",
    });
    expect(answer).toMatch(/Created the project "New Paper" at http:\/\/127\.0\.0\.1:\d+\/project\/64c0+2\./);
    expect(harness.editor.web.account.projects.at(-1)?.name).toBe("New Paper (example)");
    const createRequest = harness.editor.web.requests.find((request) => request.path === "/project/new");
    expect(createRequest?.csrfToken).toBe(harness.editor.web.csrfToken);
  });

  it("refuses an empty project name before contacting Overleaf", async () => {
    const client = await harness.startClient();
    const answer = await client.call("manage_project", { action: "create", name: "   " });
    expect(answer).toContain("Input validation error");
    expect(answer).toContain("name: Too small");
    expect(harness.editor.web.requests.some((request) => request.path === "/project/new")).toBe(false);
  });
});
