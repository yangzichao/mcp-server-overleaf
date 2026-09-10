import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { SetupError } from "../setupError.js";
import type {
  ClientRegistrationOutcome,
  McpClientTarget,
  McpServerLaunchSpecification,
} from "./mcpClientTarget.js";

const execFileAsync = promisify(execFile);

interface CommandLineClientDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly executable: string;
  readonly configurationDescription: string;
  buildAddArguments(launch: McpServerLaunchSpecification): readonly string[];
  buildRemoveArguments(serverName: string): readonly string[];
  buildGetArguments(serverName: string): readonly string[];
}

/**
 * The server name comes before the options in both, so neither CLI can mistake it for the
 * value of a preceding flag. Everything after `--` is the command the client will spawn.
 */
export const CLAUDE_CODE_CLIENT: CommandLineClientDefinition = {
  id: "claude-code",
  displayName: "Claude Code",
  executable: "claude",
  configurationDescription: "the user scope, available in every project",
  buildAddArguments: (launch) => [
    "mcp",
    "add",
    launch.serverName,
    "--scope",
    "user",
    "--transport",
    "stdio",
    "--",
    launch.command,
    ...launch.args,
  ],
  buildRemoveArguments: (serverName) => ["mcp", "remove", serverName, "--scope", "user"],
  buildGetArguments: (serverName) => ["mcp", "get", serverName],
};

export const CODEX_CLIENT: CommandLineClientDefinition = {
  id: "codex",
  displayName: "Codex",
  executable: "codex",
  configurationDescription: "~/.codex/config.toml, shared by the Codex CLI, desktop and IDE extension",
  buildAddArguments: (launch) => ["mcp", "add", launch.serverName, "--", launch.command, ...launch.args],
  buildRemoveArguments: (serverName) => ["mcp", "remove", serverName],
  buildGetArguments: (serverName) => ["mcp", "get", serverName],
};

async function succeeds(executable: string, args: readonly string[]): Promise<boolean> {
  try {
    await execFileAsync(executable, [...args], { timeout: 60_000 });
    return true;
  } catch {
    return false;
  }
}

class CommandLineClientTarget implements McpClientTarget {
  constructor(private readonly definition: CommandLineClientDefinition) {}

  get id(): string {
    return this.definition.id;
  }

  get displayName(): string {
    return this.definition.displayName;
  }

  isAvailable(): Promise<boolean> {
    return succeeds(this.definition.executable, ["--version"]);
  }

  isAlreadyRegistered(serverName: string): Promise<boolean> {
    return succeeds(this.definition.executable, this.definition.buildGetArguments(serverName));
  }

  async register(launch: McpServerLaunchSpecification): Promise<ClientRegistrationOutcome> {
    // Removing first keeps a second run from failing on a name that is already taken.
    await succeeds(this.definition.executable, this.definition.buildRemoveArguments(launch.serverName));
    try {
      await execFileAsync(this.definition.executable, [...this.definition.buildAddArguments(launch)], {
        timeout: 60_000,
      });
    } catch (error) {
      throw new SetupError(
        `${this.definition.displayName} refused to register the server.`,
        error instanceof Error ? error.message.split("\n").slice(0, 2).join(" ") : undefined,
      );
    }
    return {
      detail: `${this.definition.displayName}: added "${launch.serverName}" to ${this.definition.configurationDescription}`,
      restartRequired: this.definition.id !== "claude-code",
    };
  }
}

export function commandLineClientTargets(): readonly McpClientTarget[] {
  return [new CommandLineClientTarget(CLAUDE_CODE_CLIENT), new CommandLineClientTarget(CODEX_CLIENT)];
}
