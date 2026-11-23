import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FAKE_ZIP_BYTES } from "../fakeOverleafAccount.js";
import { useEditorTestHarness } from "../support/editorTestHarness.js";

/**
 * manage_project's account actions end to end: each reply names the project and says what
 * changed, and an action that would change nothing sends nothing.
 */

const SHARED_THESIS_ID = "64b000000000000000000002";

describe("managing projects in the account", () => {
  const harness = useEditorTestHarness();
  let localDirectory: string;

  beforeEach(() => {
    localDirectory = mkdtempSync(join(tmpdir(), "overleaf-project-zip-"));
  });

  afterEach(() => {
    rmSync(localDirectory, { recursive: true, force: true });
  });

  function accountProject(projectId: string) {
    return harness.editor.web.account.projects.find((project) => project._id === projectId);
  }

  function requestsTo(pattern: RegExp): string[] {
    return harness.editor.web.requests
      .filter((request) => pattern.test(request.path))
      .map((request) => request.method);
  }

  it("creates a project from a ZIP file, named after the file unless told otherwise", async () => {
    const zipPath = join(localDirectory, "Conference Paper.zip");
    writeFileSync(zipPath, FAKE_ZIP_BYTES);
    const client = await harness.startClient();

    const named = await client.call("manage_project", { action: "create_from_zip", sourcePath: zipPath });
    expect(named).toMatch(
      /^Created the project "Conference Paper" from .+Conference Paper\.zip at http:\/\/127\.0\.0\.1:\d+\/project\/64d0+1\./,
    );
    expect(harness.editor.web.lifecycle.projectUploads[0]?.fields.get("name")).toBe("Conference Paper.zip");

    const renamed = await client.call("manage_project", {
      action: "create_from_zip",
      sourcePath: zipPath,
      name: "Camera Ready",
    });
    expect(renamed).toContain('Created the project "Camera Ready"');
    expect(harness.editor.web.account.projects.at(-1)?.name).toBe("Camera Ready");
  });

  it("refuses a file that is not a ZIP, and a relative path, before uploading", async () => {
    const notAZip = join(localDirectory, "notes.zip");
    writeFileSync(notAZip, "plain text");
    const client = await harness.startClient();
    expect(await client.call("manage_project", { action: "create_from_zip", sourcePath: notAZip })).toContain(
      "That file is not a ZIP archive",
    );
    expect(
      await client.call("manage_project", { action: "create_from_zip", sourcePath: "paper.zip" }),
    ).toContain("sourcePath must be an absolute path");
    expect(harness.editor.web.lifecycle.projectUploads).toHaveLength(0);
  });

  it("copies a project under a new name, owned by this account", async () => {
    const client = await harness.startClient();
    const answer = await client.call("manage_project", {
      action: "copy",
      project: SHARED_THESIS_ID,
      name: "Thesis backup",
    });
    expect(answer).toMatch(
      /^Copied "Shared Thesis" to a new project "Thesis backup" at http:\/\/127\.0\.0\.1:\d+\/project\/64d0+1, owned by this account; the original is unchanged\./,
    );
    expect(harness.editor.web.account.projects.at(-1)).toMatchObject({
      name: "Thesis backup",
      accessLevel: "owner",
    });
  });

  it("renames a project the account owns, and keeps its address", async () => {
    const client = await harness.startClient();
    const answer = await client.call("manage_project", { action: "rename", name: "Final Paper" });
    expect(answer).toBe(
      `Renamed "Fake paper" to "Final Paper"; its address stays ${harness.editor.baseUrl}/project/${harness.editor.projectId}.`,
    );
    expect(accountProject(harness.editor.projectId)?.name).toBe("Final Paper");
  });

  it("refuses to rename a project someone else owns, before asking Overleaf", async () => {
    const client = await harness.startClient();
    const answer = await client.call("manage_project", {
      action: "rename",
      project: SHARED_THESIS_ID,
      name: "Mine now",
    });
    expect(answer).toBe('Only the owner of "Shared Thesis" can rename it; this account can edit it.');
    expect(requestsTo(/\/rename$/)).toEqual([]);
  });

  it("archives and unarchives a project for this account only", async () => {
    const client = await harness.startClient();
    const archived = await client.call("manage_project", { action: "archive", project: SHARED_THESIS_ID });
    expect(archived).toContain('Archived "Shared Thesis" for this account');
    expect(archived).toContain("Co-authors' project lists do not change.");
    expect(accountProject(SHARED_THESIS_ID)?.archived).toBe(true);

    const again = await client.call("manage_project", { action: "archive", project: SHARED_THESIS_ID });
    expect(again).toBe(`"Shared Thesis" is already in this account's archive; nothing changed.`);
    expect(requestsTo(/\/archive$/i)).toEqual(["POST"]);

    const restored = await client.call("manage_project", { action: "unarchive", project: SHARED_THESIS_ID });
    expect(restored).toBe(
      `Took "Shared Thesis" out of this account's archive; it is back in the dashboard's main list.`,
    );
    expect(accountProject(SHARED_THESIS_ID)?.archived).toBe(false);
  });

  it("trashes and untrashes a project without deleting it", async () => {
    const client = await harness.startClient();
    const trashed = await client.call("manage_project", { action: "trash", project: SHARED_THESIS_ID });
    expect(trashed).toContain('Moved "Shared Thesis" to this account\'s trash');
    expect(trashed).toContain("nothing was deleted");
    expect(accountProject(SHARED_THESIS_ID)?.trashed).toBe(true);

    const restored = await client.call("manage_project", { action: "untrash", project: SHARED_THESIS_ID });
    expect(restored).toContain('Took "Shared Thesis" out of this account\'s trash');
    expect(accountProject(SHARED_THESIS_ID)?.trashed).toBe(false);

    const notThere = await client.call("manage_project", { action: "untrash", project: SHARED_THESIS_ID });
    expect(notThere).toBe(`"Shared Thesis" is not in this account's trash; nothing changed.`);
  });

  it("tags a project, reusing a tag whose name differs only in case", async () => {
    const existing = harness.editor.web.tagRoutes.addTag("Thesis", []);
    const client = await harness.startClient();
    const answer = await client.call("manage_project", {
      action: "tag",
      project: SHARED_THESIS_ID,
      tag: "thesis",
    });
    expect(answer).toBe(
      `Tagged "Shared Thesis" with "Thesis". Tags are this account's own, so co-authors see no change.`,
    );
    expect(harness.editor.web.tagRoutes.tags).toHaveLength(1);
    expect(existing.project_ids).toEqual([SHARED_THESIS_ID]);

    const again = await client.call("manage_project", {
      action: "tag",
      project: SHARED_THESIS_ID,
      tag: "Thesis",
    });
    expect(again).toBe(`"Shared Thesis" already has the tag "Thesis"; nothing changed.`);
  });

  it("creates a tag the account does not have yet", async () => {
    const client = await harness.startClient();
    const answer = await client.call("manage_project", { action: "tag", tag: "Submitted" });
    expect(answer).toContain(`Tagged "Fake paper" with "Submitted", a tag this account did not have before.`);
    expect(harness.editor.web.tagRoutes.tags.map((tag) => tag.name)).toEqual(["Submitted"]);
  });

  it("untags a project, and names the account's tags when the one given does not exist", async () => {
    harness.editor.web.tagRoutes.addTag("Thesis", [SHARED_THESIS_ID]);
    const client = await harness.startClient();
    const answer = await client.call("manage_project", {
      action: "untag",
      project: SHARED_THESIS_ID,
      tag: "Thesis",
    });
    expect(answer).toContain(`Removed the tag "Thesis" from "Shared Thesis"; the tag itself stays.`);
    expect(harness.editor.web.tagRoutes.tags[0]?.project_ids).toEqual([]);

    const missing = await client.call("manage_project", {
      action: "untag",
      project: SHARED_THESIS_ID,
      tag: "Drafts",
    });
    expect(missing).toBe(`This account has no tag named "Drafts". Its tags are "Thesis".`);
  });

  it("names the argument an action is missing, and refuses one it does not take", async () => {
    const client = await harness.startClient();
    expect(await client.call("manage_project", { action: "copy" })).toBe("copy needs name.");
    expect(await client.call("manage_project", { action: "rename" })).toBe("rename needs name.");
    expect(await client.call("manage_project", { action: "create_from_zip" })).toBe(
      "create_from_zip needs sourcePath.",
    );
    expect(await client.call("manage_project", { action: "tag" })).toBe("tag needs tag.");
    expect(await client.call("manage_project", { action: "untag" })).toBe("untag needs tag.");
    expect(await client.call("manage_project", { action: "archive", name: "x" })).toBe(
      "name does not apply to archive; create, create_from_zip, copy and rename use it.",
    );
    expect(
      await client.call("manage_project", { action: "create", name: "New", project: SHARED_THESIS_ID }),
    ).toBe(
      "project does not apply to create; copy, rename, archive, unarchive, trash, untrash, tag, untag, update_settings and download_zip use it.",
    );
  });
});
