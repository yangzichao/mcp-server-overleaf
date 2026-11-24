import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeOverleafRemote } from "../fakeOverleafRemote.js";
import { McpStdioClient } from "../mcpStdioClient.js";
import { responseText } from "../support/mcpProtocol.js";

const PAPER = "\\documentclass{article}\n\\begin{document}\n\\input{sections/intro}\n\\end{document}\n";
const FOLDER_REFUSAL = "sections is a folder, not a file.";

describe("a tool given a folder, or a path inside a file, in the clone", () => {
  let remote: FakeOverleafRemote;
  let client: McpStdioClient;

  beforeEach(async () => {
    remote = await FakeOverleafRemote.create();
    await remote.collaboratorPushes("main.tex", PAPER, "Initial draft");
    await remote.collaboratorPushes("sections/intro.tex", "\\section{Intro}\nHello.\n", "Intro");
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
    ["read_file", { path: "sections" }, FOLDER_REFUSAL],
    ["read_file", { path: "sections", mode: "full" }, FOLDER_REFUSAL],
    ["read_file", { path: "sections/" }, "sections/ is a folder, not a file."],
    ["read_file", { path: "main.tex/x" }, "main.tex is a file, so main.tex/x cannot be inside it."],
    ["compile_project", { mainTexFile: "sections" }, FOLDER_REFUSAL],
    [
      "read_history",
      { view: "blame", path: "sections" },
      "sections is a folder, not a file; blame reads one file.",
    ],
  ])("%s %j is refused as the project sees it", async (toolName, toolArguments, expected) => {
    expect(await refusal(toolName, toolArguments)).toBe(expected);
  });

  it.each([
    ["edit_file", { action: "write", path: "sections", content: "x" }, FOLDER_REFUSAL],
    [
      "edit_file",
      { action: "replace_text", path: "sections", findText: "a", replaceWith: "b" },
      FOLDER_REFUSAL,
    ],
    [
      "edit_file",
      { action: "replace_section", path: "sections", sectionTitle: "Intro", content: "\\section{Intro}\n" },
      FOLDER_REFUSAL,
    ],
    [
      "edit_file",
      { action: "append", path: "sections", content: "x" },
      "sections is a folder, not a file, so text cannot be appended to it. Nothing was changed.",
    ],
    [
      "edit_file",
      { action: "write", path: "main.tex/x.tex", content: "x" },
      "main.tex is a file, so main.tex/x.tex cannot be inside it.",
    ],
    ["manage_files", { action: "upload", path: "sections", contentBase64: "aGVsbG8=" }, FOLDER_REFUSAL],
    [
      "manage_files",
      { action: "upload", path: "main.tex/y.png", contentBase64: "aGVsbG8=" },
      "main.tex is a file, so main.tex/y.png cannot be inside it.",
    ],
    [
      "manage_files",
      { action: "move", path: "main.tex", toPath: "main.tex/x.tex" },
      "main.tex is a file, so main.tex/x.tex cannot be inside it.",
    ],
    [
      "manage_files",
      { action: "move", path: "sections", toPath: "main.tex/sub" },
      "main.tex is a file, so main.tex/sub cannot be inside it.",
    ],
  ])("%s %j is refused and writes nothing", async (toolName, toolArguments, expected) => {
    expect(await refusal(toolName, toolArguments)).toBe(expected);
    expect(await client.call("read_project", { view: "changes" })).toBe("No local changes pending.");
  });

  it("says a path inside a file is not in the project when asked to delete it", async () => {
    expect(await client.call("manage_files", { action: "delete", path: "main.tex/x" })).toBe(
      "main.tex/x is not in the project, so there is nothing to delete.",
    );
  });

  it("names the project root as the root, not as a path outside the project", async () => {
    expect(await refusal("read_file", { path: "." })).toBe(
      `Path "." names the project's root folder, not a file or folder in it.`,
    );
  });
});
