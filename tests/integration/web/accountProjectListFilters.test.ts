import { describe, expect, it } from "vitest";

import { useEditorTestHarness } from "../support/editorTestHarness.js";

/**
 * list_projects with the session cookie lists the dashboard's other lists and tags too. The
 * fake account owns the real-time project, can edit "Shared Thesis" and can view "Grant Proposal".
 */

const SHARED_THESIS_ID = "64b000000000000000000002";
const GRANT_PROPOSAL_ID = "64b000000000000000000003";

describe("listing the account's projects by dashboard list and tag", () => {
  const harness = useEditorTestHarness();

  function setFlag(projectId: string, flag: "archived" | "trashed"): void {
    const project = harness.editor.web.account.projects.find((candidate) => candidate._id === projectId);
    if (!project) throw new Error(`No fake project ${projectId}.`);
    project[flag] = true;
  }

  it("offers filter and tag only where the session cookie can serve them", async () => {
    const gitOnly = await harness.startClient(harness.gitRemote.environment());
    const gitOnlyTool = (await gitOnly.listTools()).find((tool) => tool.name === "list_projects");
    expect(Object.keys(gitOnlyTool?.inputSchema.properties ?? {})).toEqual(["nameContains"]);

    const withCookie = await harness.startClient();
    const cookieTool = (await withCookie.listTools()).find((tool) => tool.name === "list_projects");
    expect(cookieTool?.inputSchema.properties?.filter).toMatchObject({
      enum: ["all", "owned", "shared", "archived", "trashed"],
    });
    expect(cookieTool?.inputSchema.properties).toHaveProperty("tag");
  });

  it("shows each project's tags on its line", async () => {
    harness.editor.web.tagRoutes.addTag("Thesis", [SHARED_THESIS_ID]);
    harness.editor.web.tagRoutes.addTag("2026", [SHARED_THESIS_ID]);
    const client = await harness.startClient();
    const listed = await client.call("list_projects");
    expect(listed).toContain(
      `- Shared Thesis — can edit — ${harness.editor.baseUrl}/project/${SHARED_THESIS_ID} — tags: Thesis, 2026`,
    );
    expect(listed).toContain(
      `- Grant Proposal — can view — ${harness.editor.baseUrl}/project/${GRANT_PROPOSAL_ID}\n`,
    );
  });

  it("lists owned and shared projects apart, without the configured ones", async () => {
    const client = await harness.startClient();
    const owned = await client.call("list_projects", { filter: "owned" });
    expect(owned).toContain("1 project owned by this account:");
    expect(owned).toContain(harness.editor.projectId);
    expect(owned).not.toContain("Shared Thesis");
    expect(owned).not.toContain("(default)");

    const shared = await client.call("list_projects", { filter: "shared" });
    expect(shared).toContain("2 projects shared with this account:");
    expect(shared).toContain("Shared Thesis");
    expect(shared).toContain("Grant Proposal");
  });

  it("leaves archived and trashed projects out of all, and lists each on its own", async () => {
    setFlag(SHARED_THESIS_ID, "archived");
    setFlag(GRANT_PROPOSAL_ID, "trashed");
    const client = await harness.startClient();

    const all = await client.call("list_projects");
    expect(all).toContain("1 project in the account:");
    expect(all).not.toContain("Shared Thesis");

    const archived = await client.call("list_projects", { filter: "archived" });
    expect(archived).toContain("1 project archived in this account:");
    expect(archived).toContain("Shared Thesis");
    expect(archived).not.toContain("Grant Proposal");

    const trashed = await client.call("list_projects", { filter: "trashed" });
    expect(trashed).toContain("1 project in this account's trash:");
    expect(trashed).toContain("Grant Proposal");
  });

  it("says when a list is empty", async () => {
    const client = await harness.startClient();
    expect(await client.call("list_projects", { filter: "archived" })).toContain(
      "No project is archived in this account.",
    );
    expect(await client.call("list_projects", { filter: "trashed", nameContains: "thesis" })).toContain(
      'No project in this account\'s trash has "thesis" in its name.',
    );
  });

  it("keeps only projects with a tag, matched ignoring case", async () => {
    harness.editor.web.tagRoutes.addTag("Thesis", [SHARED_THESIS_ID]);
    const client = await harness.startClient();
    const tagged = await client.call("list_projects", { tag: "thesis" });
    expect(tagged).toContain('1 project in the account with the tag "thesis":');
    expect(tagged).toContain("Shared Thesis");
    expect(tagged).not.toContain("Grant Proposal");
    expect(tagged).not.toContain("(default)");
  });

  it("names the account's tags when the one asked for does not exist", async () => {
    harness.editor.web.tagRoutes.addTag("Thesis", [SHARED_THESIS_ID]);
    harness.editor.web.tagRoutes.addTag("Grants", []);
    const client = await harness.startClient();
    expect(await client.call("list_projects", { tag: "Drafts" })).toContain(
      'The account has no tag named "Drafts". Its tags are "Thesis", "Grants".',
    );
    expect(await client.call("list_projects", { tag: "Grants" })).toContain(
      'No project in the account has the tag "Grants".',
    );
  });
});
