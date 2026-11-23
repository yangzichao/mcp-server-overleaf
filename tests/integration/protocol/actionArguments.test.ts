import { afterAll, beforeAll, expect, it } from "vitest";

import { FakeOverleafRemote } from "../fakeOverleafRemote.js";
import { McpStdioClient } from "../mcpStdioClient.js";

/**
 * A tool with several actions or views checks the arguments against the one chosen. A model
 * that sends findText with action "write" has misread the tool, so the call fails, says which
 * action does take findText, and changes nothing, instead of quietly ignoring the argument.
 */

const PAPER =
  "\\documentclass{article}\n\\begin{document}\n\\section{Introduction}\nHello.\n\\end{document}\n";

let remote: FakeOverleafRemote;
let client: McpStdioClient;

beforeAll(async () => {
  remote = await FakeOverleafRemote.create();
  await remote.collaboratorPushes("main.tex", PAPER, "Initial draft");
  client = await McpStdioClient.start(remote.environment());
});

afterAll(async () => {
  await client.stop();
  remote.cleanUp();
});

it.each([
  [
    "edit_file",
    { action: "write", path: "main.tex", content: "x", findText: "Hello." },
    "findText does not apply to write; replace_text uses it.",
  ],
  [
    "edit_file",
    { action: "replace_text", path: "main.tex", content: "x", findText: "Hello.", replaceWith: "Hi." },
    "content does not apply to replace_text; replace_section, write and append use it.",
  ],
  [
    "edit_file",
    { action: "replace_text", path: "main.tex", replaceWith: "Hi." },
    "replace_text needs findText.",
  ],
  [
    "edit_file",
    { action: "replace_section", path: "main.tex", content: "\\section{Introduction}\nHi.\n" },
    "replace_section needs sectionTitle.",
  ],
  ["edit_file", { action: "write", path: "main.tex" }, "write needs content."],
  ["read_project", { path: "main.tex" }, "path does not apply to overview; outline and changes use it."],
  [
    "read_project",
    { view: "files", followIncludes: false },
    "followIncludes does not apply to files; outline uses it.",
  ],
  ["manage_files", { action: "move", path: "main.tex" }, "move needs toPath."],
  [
    "manage_files",
    { action: "discard_local_changes", path: "main.tex" },
    "path does not apply to discard_local_changes; delete, move, upload and restore use it.",
  ],
  ["manage_files", { action: "restore", path: "main.tex" }, "restore needs revision."],
  [
    "read_file",
    { path: "main.tex", sectionTitle: "Introduction", startLine: 1 },
    "sectionTitle reads one whole section, so it cannot use startLine or endLine.",
  ],
])("%s refuses %j", async (toolName, toolArguments, expectedMessage) => {
  const response = await client.callRaw(toolName, toolArguments);
  expect(response.result?.isError).toBe(true);
  expect(response.result?.content?.[0]?.text).toBe(expectedMessage);
});

it("changes nothing when it refuses", async () => {
  expect(await client.call("read_project", { view: "changes" })).toBe("No local changes pending.");
  expect(await remote.readPublishedFile("main.tex")).toBe(PAPER);
});

it("reads one section by title, now or at a recorded revision", async () => {
  const section = await client.call("read_file", { path: "main.tex", sectionTitle: "introduction" });
  expect(section).toContain("\\section{Introduction}");
  expect(section).toContain("Hello.");
  expect(section).not.toContain("\\documentclass");
  const atRevision = await client.call("read_file", {
    path: "main.tex",
    sectionTitle: "Introduction",
    revision: await remote.publishedHeadHash(),
  });
  expect(atRevision).toBe(section);
  const missing = await client.call("read_file", { path: "main.tex", sectionTitle: "Results" });
  expect(missing).toBe('No section matching "Results" in main.tex. Available: Introduction');
});
