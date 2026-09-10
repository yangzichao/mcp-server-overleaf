import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import type {
  ClientRegistrationOutcome,
  McpClientTarget,
  McpServerLaunchSpecification,
} from "./mcpClientTarget.js";

interface JsonConfigurationClientDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly configurationFilePath: string;
  /** Present once the application has run at least once, which is how we detect it. */
  readonly installationMarkerPath: string;
}

function claudeDesktopConfigurationFile(): string {
  if (process.platform === "darwin") {
    return resolve(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  if (process.platform === "win32") {
    const applicationData = process.env.APPDATA?.trim() || resolve(homedir(), "AppData", "Roaming");
    return resolve(applicationData, "Claude", "claude_desktop_config.json");
  }
  return resolve(homedir(), ".config", "Claude", "claude_desktop_config.json");
}

export function jsonConfigurationClientDefinitions(): readonly JsonConfigurationClientDefinition[] {
  const claudeDesktopFile = claudeDesktopConfigurationFile();
  return [
    {
      id: "claude-desktop",
      displayName: "Claude Desktop",
      configurationFilePath: claudeDesktopFile,
      installationMarkerPath: dirname(claudeDesktopFile),
    },
    {
      id: "cursor",
      displayName: "Cursor",
      configurationFilePath: resolve(homedir(), ".cursor", "mcp.json"),
      installationMarkerPath: resolve(homedir(), ".cursor"),
    },
  ];
}

export interface McpServersConfiguration {
  mcpServers?: Record<string, unknown>;
  [otherSetting: string]: unknown;
}

/**
 * Merged rather than replaced. These files hold every MCP server the person has set up,
 * and overwriting one to add ours would silently disconnect the rest.
 */
export function mergeMcpServerIntoConfiguration(
  existingConfiguration: McpServersConfiguration,
  launch: McpServerLaunchSpecification,
): McpServersConfiguration {
  return {
    ...existingConfiguration,
    mcpServers: {
      ...(existingConfiguration.mcpServers ?? {}),
      [launch.serverName]: { command: launch.command, args: [...launch.args] },
    },
  };
}

function readConfiguration(filePath: string): McpServersConfiguration {
  if (!existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as McpServersConfiguration) : {};
  } catch {
    return {};
  }
}

class JsonConfigurationClientTarget implements McpClientTarget {
  constructor(private readonly definition: JsonConfigurationClientDefinition) {}

  get id(): string {
    return this.definition.id;
  }

  get displayName(): string {
    return this.definition.displayName;
  }

  isAvailable(): Promise<boolean> {
    return Promise.resolve(existsSync(this.definition.installationMarkerPath));
  }

  isAlreadyRegistered(serverName: string): Promise<boolean> {
    return Promise.resolve(
      Boolean(readConfiguration(this.definition.configurationFilePath).mcpServers?.[serverName]),
    );
  }

  register(launch: McpServerLaunchSpecification): Promise<ClientRegistrationOutcome> {
    const { configurationFilePath } = this.definition;
    const existingConfiguration = readConfiguration(configurationFilePath);

    mkdirSync(dirname(configurationFilePath), { recursive: true });
    if (existsSync(configurationFilePath)) {
      copyFileSync(configurationFilePath, `${configurationFilePath}.previous`);
    }
    const merged = mergeMcpServerIntoConfiguration(existingConfiguration, launch);
    writeFileSync(configurationFilePath, `${JSON.stringify(merged, null, 2)}\n`);

    return Promise.resolve({
      detail: `${this.definition.displayName}: added "${launch.serverName}" to ${configurationFilePath}`,
      restartRequired: true,
    });
  }
}

export function jsonConfigurationClientTargets(): readonly McpClientTarget[] {
  return jsonConfigurationClientDefinitions().map(
    (definition) => new JsonConfigurationClientTarget(definition),
  );
}
