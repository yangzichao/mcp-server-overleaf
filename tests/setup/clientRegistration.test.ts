import { describe, expect, it } from "vitest";
import { CLAUDE_CODE_CLIENT, CODEX_CLIENT } from "../../src/setup/clients/commandLineClientTargets.js";
import { mergeMcpServerIntoConfiguration } from "../../src/setup/clients/jsonConfigurationClientTargets.js";

const launch = {
  serverName: "overleaf",
  command: "/usr/local/bin/node",
  args: ["/home/researcher/.overleaf-mcp/runtime/node_modules/mcp-server-overleaf/dist/index.js", "--stdio"],
};

describe("command line client arguments", () => {
  it("puts the server name before the options, so neither CLI reads it as a flag value", () => {
    expect(CLAUDE_CODE_CLIENT.buildAddArguments(launch)[2]).toBe("overleaf");
    expect(CODEX_CLIENT.buildAddArguments(launch)[2]).toBe("overleaf");
  });

  it("separates the spawn command with --", () => {
    for (const client of [CLAUDE_CODE_CLIENT, CODEX_CLIENT]) {
      const argumentsValue = client.buildAddArguments(launch);
      const separator = argumentsValue.indexOf("--");
      expect(separator).toBeGreaterThan(0);
      expect(argumentsValue.slice(separator + 1)).toEqual([launch.command, ...launch.args]);
    }
  });

  it("registers Claude Code at user scope so every project sees it", () => {
    expect(CLAUDE_CODE_CLIENT.buildAddArguments(launch)).toContain("user");
    expect(CLAUDE_CODE_CLIENT.buildRemoveArguments("overleaf")).toEqual([
      "mcp",
      "remove",
      "overleaf",
      "--scope",
      "user",
    ]);
  });
});

describe("mergeMcpServerIntoConfiguration", () => {
  it("adds the server without disturbing the ones already configured", () => {
    const merged = mergeMcpServerIntoConfiguration(
      { mcpServers: { existing: { command: "other" } }, theme: "dark" },
      launch,
    );
    expect(Object.keys(merged.mcpServers ?? {}).sort()).toEqual(["existing", "overleaf"]);
    expect(merged.theme).toBe("dark");
  });

  it("replaces its own entry rather than duplicating it", () => {
    const first = mergeMcpServerIntoConfiguration({}, launch);
    const second = mergeMcpServerIntoConfiguration(first, { ...launch, command: "/opt/node" });
    expect(second.mcpServers?.overleaf).toEqual({ command: "/opt/node", args: launch.args });
  });

  it("writes no environment variables, because the server finds its own configuration", () => {
    const merged = mergeMcpServerIntoConfiguration({}, launch);
    expect(merged.mcpServers?.overleaf).not.toHaveProperty("env");
  });
});
