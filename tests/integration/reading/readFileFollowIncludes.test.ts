import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeOverleafRemote } from "../fakeOverleafRemote.js";
import { McpStdioClient } from "../mcpStdioClient.js";

/**
 * read_file (followIncludes) on the clone: the paper as one file, each included file between
 * comment lines naming it, then a note for every include that was left as written.
 */

const MAIN = [
  "\\documentclass{article}",
  "\\begin{document}",
  "\\input{sections/intro}",
  "\\input{sections/method}",
  "\\input{sections/missing}",
  "\\end{document}",
  "",
].join("\n");

let remote: FakeOverleafRemote;
let client: McpStdioClient | undefined;

beforeEach(async () => {
  remote = await FakeOverleafRemote.create();
  await remote.collaboratorPushes("main.tex", MAIN, "Initial draft");
  await remote.collaboratorPushes("sections/intro.tex", "Intro text.\n", "Add the introduction");
  await remote.collaboratorPushes(
    "sections/method.tex",
    "Method text.\n\\input{sections/method}\n",
    "Add the method",
  );
  await remote.collaboratorPushes("refs.bib", "@misc{a, title={A}}\n", "Add references");
});

afterEach(async () => {
  await client?.stop();
  client = undefined;
  remote.cleanUp();
});

async function refusalFor(toolArguments: Record<string, unknown>): Promise<string> {
  const response = await client?.callRaw("read_file", toolArguments);
  expect(response?.result?.isError, JSON.stringify(toolArguments)).toBe(true);
  return response?.result?.content?.[0]?.text ?? "";
}

describe("read_file with followIncludes in the clone", () => {
  it("inlines each included file between markers and lists what it left as written", async () => {
    client = await McpStdioClient.start(remote.environment());
    const text = await client.call("read_file", { path: "main.tex", followIncludes: true });

    expect(text).toContain(
      "% ---- begin sections/intro.tex, from \\input{sections/intro} ----\nIntro text.\n% ---- end sections/intro.tex ----",
    );
    expect(text).toContain(
      "% ---- begin sections/method.tex, from \\input{sections/method} ----\nMethod text.",
    );
    expect(text).toContain(
      'Inlined 2 files between "% ---- begin" and "% ---- end" comments: sections/intro.tex, sections/method.tex.',
    );
    expect(text).toContain(
      "Not found, left as written: \\input{sections/missing} at main.tex:5; tried sections/missing.tex",
    );
    expect(text).toContain(
      "Not inlined: \\input{sections/method} at sections/method.tex:2, because sections/method.tex is already being inlined here, an include cycle.",
    );
  });

  it("pulls from Overleaf first, so a co-author's change to an included file shows", async () => {
    client = await McpStdioClient.start(remote.environment());
    await client.call("read_file", { path: "main.tex" });
    await remote.collaboratorPushes("sections/intro.tex", "Rewritten introduction.\n", "Rewrite it");
    const text = await client.call("read_file", { path: "main.tex", followIncludes: true });
    expect(text).toContain("Rewritten introduction.");
    expect(text).not.toContain("Intro text.");
  });

  it("says a file that includes nothing is returned as it is", async () => {
    client = await McpStdioClient.start(remote.environment());
    const text = await client.call("read_file", { path: "sections/intro.tex", followIncludes: true });
    expect(text).toBe(
      "Intro text.\n\nsections/intro.tex includes no other project file, so it is returned as it is.",
    );
  });

  it("refuses every other read argument, and a file that is not .tex", async () => {
    client = await McpStdioClient.start(remote.environment());
    expect(await refusalFor({ path: "main.tex", followIncludes: true, startLine: 2 })).toBe(
      "followIncludes returns the whole file with its includes inlined, so it cannot use startLine.",
    );
    expect(
      await refusalFor({ path: "main.tex", followIncludes: true, mode: "smart", revision: "abc1234" }),
    ).toBe(
      "followIncludes returns the whole file with its includes inlined, so it cannot use mode, revision.",
    );
    expect(await refusalFor({ path: "main.tex", followIncludes: true, sectionTitle: "Intro" })).toBe(
      "followIncludes returns the whole file with its includes inlined, so it cannot use sectionTitle.",
    );
    expect(await refusalFor({ path: "refs.bib", followIncludes: true })).toBe(
      "followIncludes works on a .tex file, and refs.bib is not one.",
    );
  });
});
