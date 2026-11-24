import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FAKE_ZIP_BYTES } from "../fakeOverleafAccount.js";
import { useEditorTestHarness } from "../support/editorTestHarness.js";

describe("downloading the project as a ZIP", () => {
  const harness = useEditorTestHarness();
  let downloadDirectory: string;

  beforeEach(() => {
    downloadDirectory = mkdtempSync(join(tmpdir(), "overleaf-zip-"));
  });

  afterEach(() => {
    rmSync(downloadDirectory, { recursive: true, force: true });
  });

  it("saves the archive where asked", async () => {
    const target = join(downloadDirectory, "paper.zip");
    const client = await harness.startClient();
    const answer = await client.call("manage_project", { action: "download_zip", saveTo: target });
    expect(answer).toContain(`Saved the project archive (${FAKE_ZIP_BYTES.length} bytes) to ${target}.`);
    expect(readFileSync(target)).toEqual(FAKE_ZIP_BYTES);
  });

  it("refuses a directory that does not exist", async () => {
    const client = await harness.startClient();
    const answer = await client.call("manage_project", {
      action: "download_zip",
      saveTo: join(downloadDirectory, "missing", "paper.zip"),
    });
    expect(answer).toContain("does not exist. Nothing was saved.");
  });
});
