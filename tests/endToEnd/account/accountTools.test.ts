import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LIVE_PROJECT_NAME, LiveOverleafServer } from "../support/liveOverleafServer.js";
import { liveEditorConfigured, requireLiveOverleafSettings } from "../support/liveOverleafSettings.js";
import { callSucceeding } from "../support/liveToolCalls.js";

// manage_project (action create) is left out on purpose: no tool deletes a project for good,
// so every run would leave one behind in the account's trash.
describe.skipIf(!liveEditorConfigured)("the account tools against a live Overleaf account", () => {
  let server: LiveOverleafServer;
  const call = (toolName: string, toolArguments: Record<string, unknown> = {}) =>
    callSucceeding(server.client, toolName, toolArguments);

  beforeAll(async () => {
    server = await LiveOverleafServer.start("editorOnly");
  });

  afterAll(async () => {
    await server?.stop();
  });

  it("lists the account's projects, the registered one marked", async () => {
    const listing = await call("list_projects");
    expect(listing).toContain(`/project/${requireLiveOverleafSettings().projectId}`);
    expect(listing).toContain(LIVE_PROJECT_NAME);
  });

  it("compiles on Overleaf and saves the PDF in the server's build directory", async () => {
    // With only a session cookie, compile_project compiles on Overleaf and takes no where.
    const report = await call("compile_project", { project: LIVE_PROJECT_NAME });
    const { projectId } = requireLiveOverleafSettings();
    const pdfPath = join(server.scratchDirectory, "workspace", ".build", projectId, "overleaf", "output.pdf");
    expect(report).toContain(`to ${pdfPath}.`);
    expect(readFileSync(pdfPath).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("downloads the project as a ZIP archive", async () => {
    const zipPath = join(server.scratchDirectory, "project.zip");
    const reply = await call("manage_project", {
      action: "download_zip",
      project: LIVE_PROJECT_NAME,
      saveTo: zipPath,
    });
    expect(reply).toContain(`to ${zipPath}.`);
    expect(readFileSync(zipPath).subarray(0, 2).toString("latin1")).toBe("PK");
  });
});
