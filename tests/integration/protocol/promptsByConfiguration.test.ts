import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { McpStdioClient } from "../mcpStdioClient.js";

/**
 * The prompts a client's menu shows under each configuration, over the protocol. A prompt that
 * depends on tools a credential does not offer is left out, the way the tools themselves are.
 */

const GIT_TOKEN = {
  OVERLEAF_GIT_TOKEN: "olp_test_token_not_a_real_secret",
  OVERLEAF_PROJECT_ID: "64a1b2c3d4e5f6a7b8c9d0e1",
};
// Listing and building prompts never contacts Overleaf, so an unreachable address is enough.
const SESSION_COOKIE = {
  OVERLEAF_SESSION_COOKIE: "s%3Aplaceholder",
  OVERLEAF_WEB_BASE_URL: "http://127.0.0.1:9",
};

const EVERY_PROMPT = [
  "review_paper",
  "revise_section",
  "address_review_comments",
  "resolve_push_conflict",
  "prepare_arxiv_submission",
];

const CONFIGURATIONS = [
  {
    configured: "a Git token only",
    credentials: GIT_TOKEN,
    expectedPrompts: EVERY_PROMPT.filter((name) => name !== "address_review_comments"),
  },
  {
    configured: "a session cookie only",
    credentials: SESSION_COOKIE,
    expectedPrompts: EVERY_PROMPT.filter((name) => name !== "resolve_push_conflict"),
  },
  {
    configured: "both credentials",
    credentials: { ...GIT_TOKEN, ...SESSION_COOKIE },
    expectedPrompts: EVERY_PROMPT,
  },
  { configured: "nothing", credentials: {}, expectedPrompts: EVERY_PROMPT },
];

let isolatedHome: string;
let client: McpStdioClient | undefined;

beforeEach(() => {
  isolatedHome = mkdtempSync(join(tmpdir(), "overleaf-prompts-"));
});

afterEach(async () => {
  await client?.stop();
  client = undefined;
  rmSync(isolatedHome, { recursive: true, force: true });
});

function startServer(credentials: NodeJS.ProcessEnv): Promise<McpStdioClient> {
  const emptyEnvironmentFile = join(isolatedHome, "empty.env");
  writeFileSync(emptyEnvironmentFile, "");
  return McpStdioClient.start({
    HOME: isolatedHome,
    XDG_CONFIG_HOME: join(isolatedHome, ".config"),
    // Without this an unconfigured server falls back to the checkout's own .env.
    OVERLEAF_MCP_ENV_FILE: emptyEnvironmentFile,
    OVERLEAF_MCP_WORKSPACE_DIR: join(isolatedHome, "projects"),
    ...credentials,
  });
}

describe.each(CONFIGURATIONS)("a server configured with $configured", ({ credentials, expectedPrompts }) => {
  it(`lists exactly ${expectedPrompts.length} prompts, each with a title and a description`, async () => {
    client = await startServer(credentials);
    const prompts = await client.listPrompts();
    expect(prompts.map((prompt) => prompt.name).sort()).toEqual([...expectedPrompts].sort());
    for (const prompt of prompts) {
      expect(prompt.title ?? "", `${prompt.name} title`).not.toBe("");
      expect(prompt.description ?? "", `${prompt.name} description`).not.toBe("");
    }
  });
});

describe("prompts/get", () => {
  it("fills a prompt's arguments into one user message", async () => {
    client = await startServer(GIT_TOKEN);
    const revise = (await client.listPrompts()).find((prompt) => prompt.name === "revise_section");
    expect(revise?.arguments).toContainEqual(
      expect.objectContaining({ name: "sectionTitle", required: true }),
    );

    const response = await client.getPrompt("revise_section", {
      sectionTitle: "Related Work",
      goal: "half as long",
      project: "thesis",
    });
    const messages = response.result?.messages ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe("user");
    const text = messages[0]?.content.text ?? "";
    expect(text).toContain('Revise the section "Related Work" of the Overleaf project thesis.');
    expect(text).toContain("Goal: half as long.");
    expect(text).toContain('Pass project: "thesis" to every tool call.');
    expect(text).toContain("Do not call push_changes until I approve the diff.");
  });

  it("refuses a prompt without its required argument, and one this configuration does not offer", async () => {
    client = await startServer(GIT_TOKEN);
    expect((await client.getPrompt("revise_section", {})).error).toBeDefined();
    expect((await client.getPrompt("address_review_comments", {})).error).toBeDefined();
  });
});
