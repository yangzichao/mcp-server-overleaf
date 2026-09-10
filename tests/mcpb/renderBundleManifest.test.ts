import { describe, expect, it } from "vitest";

// @ts-expect-error - build tooling is plain JavaScript, deliberately outside the TypeScript program.
import { renderBundleManifest } from "../../scripts/mcpb/renderBundleManifest.mjs";

const packageMetadata = {
  name: "mcp-server-overleaf",
  version: "9.9.9",
  description: "MCP server for Overleaf.",
  author: "Zichao Yang",
  license: "MIT",
  homepage: "https://github.com/yangzichao/mcp-server-overleaf#readme",
  bugs: { url: "https://github.com/yangzichao/mcp-server-overleaf/issues" },
  repository: { url: "git+https://github.com/yangzichao/mcp-server-overleaf.git" },
  keywords: ["mcp", "overleaf"],
};

const tools = [
  { name: "read_file", description: "Read a file." },
  { name: "push_changes", description: "Publish to Overleaf." },
];

function render(overrides: Record<string, unknown> = {}) {
  return renderBundleManifest({
    packageMetadata,
    tools,
    entryPoint: "server/dist/index.js",
    iconPath: "icon.png",
    ...overrides,
  });
}

describe("renderBundleManifest", () => {
  it("carries the version and identity of the package being packed", () => {
    const manifest = render();
    expect(manifest.manifest_version).toBe("0.3");
    expect(manifest.name).toBe("mcp-server-overleaf");
    expect(manifest.version).toBe("9.9.9");
    expect(manifest.author.name).toBe("Zichao Yang");
  });

  it("launches the entry point it was given, on stdio", () => {
    const manifest = render();
    expect(manifest.server.entry_point).toBe("server/dist/index.js");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: MCPB substitution syntax.
    expect(manifest.server.mcp_config.args).toEqual(["${__dirname}/server/dist/index.js", "--stdio"]);
  });

  it("passes both user answers as environment variables rather than files", () => {
    const manifest = render();
    // biome-ignore-start lint/suspicious/noTemplateCurlyInString: MCPB substitution syntax.
    expect(manifest.server.mcp_config.env).toEqual({
      OVERLEAF_GIT_TOKEN: "${user_config.overleaf_git_token}",
      OVERLEAF_PROJECT_ID: "${user_config.overleaf_project_url}",
    });
    // biome-ignore-end lint/suspicious/noTemplateCurlyInString: end of MCPB syntax
  });

  it("marks the token as sensitive so the install panel masks it", () => {
    expect(render().user_config.overleaf_git_token.sensitive).toBe(true);
    expect(render().user_config.overleaf_git_token.required).toBe(true);
  });

  it("declares an HTTPS privacy policy, which the directory rejects a bundle without", () => {
    for (const url of render().privacy_policies) expect(url).toMatch(/^https:\/\//);
  });

  it("claims only the platforms Claude Desktop runs on", () => {
    expect(render().compatibility.platforms).toEqual(["darwin", "win32"]);
  });

  it("lists exactly the tools it was handed", () => {
    expect(render().tools.map((tool: { name: string }) => tool.name)).toEqual(["read_file", "push_changes"]);
    expect(render().tools_generated).toBe(false);
  });

  it("refuses to describe a tool surface it was not given", () => {
    expect(() => render({ tools: [] })).toThrow(/tool list/);
  });

  it("refuses a tool name longer than MCPB allows", () => {
    expect(() => render({ tools: [{ name: "a".repeat(65), description: "Too long." }] })).toThrow(
      /64 characters/,
    );
  });
});
