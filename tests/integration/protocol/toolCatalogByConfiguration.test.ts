import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { McpStdioClient } from "../mcpStdioClient.js";

/**
 * What a client is offered under each configuration. A credential lists only the tools it can
 * serve; no credential at all lists every tool, because a directory's sandbox starts the server
 * that way. A tool is a read or a write in every configuration, never a mix, so a client can
 * approve every read at once and still be asked about each write.
 */

const READ_TOOLS = [
  "list_projects",
  "read_project",
  "read_file",
  "search_project",
  "read_history",
  "check_references",
  "look_up_citations",
  "compile_project",
  "read_review",
];
const WRITE_TOOLS = [
  "edit_file",
  "manage_files",
  "push_changes",
  "manage_tracked_changes",
  "manage_comments",
  "manage_project",
];

const GIT_TOKEN = {
  OVERLEAF_GIT_TOKEN: "olp_test_token_not_a_real_secret",
  OVERLEAF_PROJECT_ID: "64a1b2c3d4e5f6a7b8c9d0e1",
};
// Listing tools never contacts Overleaf, so an unreachable address is enough.
const SESSION_COOKIE = {
  OVERLEAF_SESSION_COOKIE: "s%3Aplaceholder",
  OVERLEAF_WEB_BASE_URL: "http://127.0.0.1:9",
};

const CONFIGURATIONS = [
  {
    configured: "a Git token only",
    credentials: GIT_TOKEN,
    expectedTools: [
      "list_projects",
      "read_project",
      "read_file",
      "search_project",
      "read_history",
      "check_references",
      "look_up_citations",
      "compile_project",
      "edit_file",
      "manage_files",
      "push_changes",
    ],
  },
  {
    configured: "a session cookie only",
    credentials: SESSION_COOKIE,
    expectedTools: [
      "list_projects",
      "read_project",
      "read_file",
      "search_project",
      "check_references",
      "compile_project",
      "read_review",
      "edit_file",
      "manage_files",
      "manage_tracked_changes",
      "manage_comments",
      "manage_project",
    ],
  },
  {
    configured: "both credentials",
    credentials: { ...GIT_TOKEN, ...SESSION_COOKIE },
    expectedTools: [...READ_TOOLS, ...WRITE_TOOLS],
  },
  { configured: "nothing", credentials: {}, expectedTools: [...READ_TOOLS, ...WRITE_TOOLS] },
];

let isolatedHome: string;
let client: McpStdioClient | undefined;

beforeEach(() => {
  isolatedHome = mkdtempSync(join(tmpdir(), "overleaf-catalog-"));
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

describe.each(CONFIGURATIONS)("a server configured with $configured", ({ credentials, expectedTools }) => {
  it(`lists exactly ${expectedTools.length} tools`, async () => {
    client = await startServer(credentials);
    const names = await client.listToolNames();
    expect([...names].sort()).toEqual([...expectedTools].sort());
  });

  it("marks every read read-only and every write not, whatever the configuration", async () => {
    client = await startServer(credentials);
    for (const tool of await client.listTools()) {
      expect(READ_TOOLS.includes(tool.name) || WRITE_TOOLS.includes(tool.name), tool.name).toBe(true);
      expect(tool.annotations?.readOnlyHint, `${tool.name} readOnlyHint`).toBe(
        READ_TOOLS.includes(tool.name),
      );
      if (WRITE_TOOLS.includes(tool.name)) {
        expect(tool.annotations?.destructiveHint, `${tool.name} destructiveHint`).toBe(true);
      }
    }
  });

  it("gives every tool a flat object schema and describes each tool and parameter without dashes", async () => {
    client = await startServer(credentials);
    for (const tool of await client.listTools()) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema, `${tool.name} input schema`).not.toHaveProperty("oneOf");
      expect(tool.inputSchema, `${tool.name} input schema`).not.toHaveProperty("anyOf");
      expect(tool.title ?? "", `${tool.name} has no title`).not.toBe("");
      expect(tool.description ?? "", `${tool.name} has no description`).not.toBe("");
      expect(tool.description, `${tool.name} description has an em dash`).not.toContain("—");
      const properties = (tool.inputSchema.properties ?? {}) as Record<string, { description?: string }>;
      for (const [parameterName, schema] of Object.entries(properties)) {
        expect(schema.description ?? "", `${tool.name}.${parameterName} has no description`).not.toBe("");
        expect(schema.description, `${tool.name}.${parameterName} has an em dash`).not.toContain("—");
      }
    }
  });
});
