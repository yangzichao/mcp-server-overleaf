import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeOverleafRemote } from "../fakeOverleafRemote.js";
import { McpStdioClient } from "../mcpStdioClient.js";
import { responseText } from "../support/mcpProtocol.js";

/**
 * A file that is not in the clone is named as the project sees it. Node's own message, an
 * ENOENT with the clone's absolute path, tells a model nothing it can act on.
 */

const PAPER = "\\documentclass{article}\n\\begin{document}\nHello.\n\\end{document}\n";

describe("a tool asked for a file the clone does not have", () => {
  let remote: FakeOverleafRemote;
  let client: McpStdioClient;

  beforeEach(async () => {
    remote = await FakeOverleafRemote.create();
    await remote.collaboratorPushes("main.tex", PAPER, "Initial draft");
    await remote.collaboratorPushes("notes.tex", "Notes.\n", "Notes");
    client = await McpStdioClient.start(remote.environment());
  });

  afterEach(async () => {
    await client.stop();
    remote.cleanUp();
  });

  async function refusal(toolName: string, toolArguments: Record<string, unknown>): Promise<string> {
    const response = await client.callRaw(toolName, toolArguments);
    expect(response.result?.isError).toBe(true);
    return responseText(response);
  }

  it.each([
    ["read_file", { path: "sections/new.tex" }],
    ["edit_file", { action: "replace_text", path: "sections/new.tex", findText: "a", replaceWith: "b" }],
    ["compile_project", { mainTexFile: "sections/new.tex" }],
  ])("%s says the file is not in the project", async (toolName, toolArguments) => {
    expect(await refusal(toolName, toolArguments)).toBe("No file sections/new.tex in the project.");
  });

  it("says a file deleted in the clone is deleted there, not pushed yet", async () => {
    await client.call("manage_files", { action: "delete", path: "notes.tex" });
    expect(await refusal("read_file", { path: "notes.tex" })).toBe(
      "notes.tex is deleted in the clone, and the deletion is not pushed yet.",
    );
  });
});
