import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { McpStdioClient } from "../../integration/mcpStdioClient.js";

export class UnconfiguredServer {
  private constructor(
    private readonly isolatedHome: string,
    readonly client: McpStdioClient,
  ) {}

  static async start(environment: NodeJS.ProcessEnv = {}): Promise<UnconfiguredServer> {
    const isolatedHome = mkdtempSync(join(tmpdir(), "overleaf-feature-unconfigured-"));
    const emptyEnvironmentFile = join(isolatedHome, "empty.env");
    writeFileSync(emptyEnvironmentFile, "");
    try {
      const client = await McpStdioClient.start({
        HOME: isolatedHome,
        XDG_CONFIG_HOME: join(isolatedHome, ".config"),
        OVERLEAF_MCP_ENV_FILE: emptyEnvironmentFile,
        OVERLEAF_MCP_WORKSPACE_DIR: join(isolatedHome, "projects"),
        ...environment,
      });
      return new UnconfiguredServer(isolatedHome, client);
    } catch (error) {
      rmSync(isolatedHome, { recursive: true, force: true });
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.client.stop();
    rmSync(this.isolatedHome, { recursive: true, force: true });
  }
}
