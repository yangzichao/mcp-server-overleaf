import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LIVE_PROJECT_NAME, LiveOverleafServer, liveRunIdentifier } from "../support/liveOverleafServer.js";
import { liveEditorConfigured } from "../support/liveOverleafSettings.js";
import { callSucceeding } from "../support/liveToolCalls.js";

// One fixed tag, reused by every run: untag leaves the tag itself in the account, so a tag
// per run would pile up.
const END_TO_END_TAG = "mcp-e2e";
const runTag = liveRunIdentifier().slice(-6);

function originalNameFromRenameReply(reply: string): string {
  const match = /^Renamed "(.*)" to "/.exec(reply);
  if (!match?.[1]) throw new Error(`rename did not report the old name: ${reply}`);
  return match[1];
}

// update_settings is left out: no view reports the current compiler, TeX Live image or
// spell-check language, so a run could not put them back as it found them.
describe.skipIf(!liveEditorConfigured)(
  "organising the live project in the account's dashboard, and putting it back",
  () => {
    let server: LiveOverleafServer;
    let originalName: string | undefined;
    const manageProject = (toolArguments: Record<string, unknown>) =>
      callSucceeding(server.client, "manage_project", { project: LIVE_PROJECT_NAME, ...toolArguments });
    const putBack = (toolArguments: Record<string, unknown>) =>
      manageProject(toolArguments).catch(() => undefined);

    beforeAll(async () => {
      server = await LiveOverleafServer.start("editorOnly");
    });

    afterAll(async () => {
      if (!server) return;
      try {
        if (originalName) await putBack({ action: "rename", name: originalName });
        await putBack({ action: "unarchive" });
        await putBack({ action: "untrash" });
        await putBack({ action: "untag", tag: END_TO_END_TAG });
      } finally {
        await server.stop();
      }
    });

    it("lists the project's members, its owner first", async () => {
      expect(
        await callSucceeding(server.client, "read_project", { project: LIVE_PROJECT_NAME, view: "members" }),
      ).toMatch(/^Members of ".*":\nOwner: /);
    });

    it("counts the main document's words the way Overleaf does", async () => {
      expect(
        await callSucceeding(server.client, "read_project", {
          project: LIVE_PROJECT_NAME,
          view: "word_count",
        }),
      ).toContain("Overleaf's word count for ");
    });

    it("renames the project and back, keeping its address", async () => {
      const temporaryName = `mcp-e2e rename ${runTag}`;
      const renamed = await manageProject({ action: "rename", name: temporaryName });
      originalName = originalNameFromRenameReply(renamed);
      expect(renamed).toContain(`to "${temporaryName}"; its address stays`);
      expect(await manageProject({ action: "rename", name: originalName })).toContain(
        `Renamed "${temporaryName}" to "${originalName}"`,
      );
      originalName = undefined;
    });

    it("archives and unarchives the project for this account only", async () => {
      expect(await manageProject({ action: "archive" })).toContain(
        "Co-authors' project lists do not change.",
      );
      expect(await manageProject({ action: "unarchive" })).toContain("out of this account's archive");
    });

    it("moves the project to the trash and takes it out again", async () => {
      expect(await manageProject({ action: "trash" })).toContain("nothing was deleted");
      expect(await manageProject({ action: "untrash" })).toContain("out of this account's trash");
    });

    it("tags and untags the project", async () => {
      expect(await manageProject({ action: "tag", tag: END_TO_END_TAG })).toContain(
        `with "${END_TO_END_TAG}"`,
      );
      expect(await manageProject({ action: "untag", tag: END_TO_END_TAG })).toContain(
        `Removed the tag "${END_TO_END_TAG}"`,
      );
    });
  },
);
