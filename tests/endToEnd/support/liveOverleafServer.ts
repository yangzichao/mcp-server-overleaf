import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { McpStdioClient } from "../../integration/mcpStdioClient.js";
import { requireLiveOverleafSettings } from "./liveOverleafSettings.js";

export const LIVE_PROJECT_NAME = "e2e";

export type LiveCredentials = "gitBridgeAndEditor" | "gitBridgeOnly" | "editorOnly";

export class LiveOverleafServer {
  private constructor(
    readonly client: McpStdioClient,
    readonly scratchDirectory: string,
  ) {}

  static async start(credentials: LiveCredentials): Promise<LiveOverleafServer> {
    const settings = requireLiveOverleafSettings();
    const scratchDirectory = mkdtempSync(join(tmpdir(), "overleaf-mcp-e2e-"));
    const environment: NodeJS.ProcessEnv = {
      OVERLEAF_PROJECTS: `${LIVE_PROJECT_NAME}=${settings.projectId}`,
      OVERLEAF_MCP_WORKSPACE_DIR: join(scratchDirectory, "workspace"),
      XDG_CONFIG_HOME: join(scratchDirectory, "config"),
      OVERLEAF_WEB_BASE_URL: settings.webBaseUrl,
    };
    if (credentials !== "editorOnly" && settings.gitToken) {
      environment.OVERLEAF_GIT_TOKEN = settings.gitToken;
    }
    if (credentials !== "gitBridgeOnly" && settings.sessionCookie) {
      environment.OVERLEAF_SESSION_COOKIE = settings.sessionCookie;
    }
    try {
      return new LiveOverleafServer(await McpStdioClient.start(environment), scratchDirectory);
    } catch (error) {
      rmSync(scratchDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  async stop(): Promise<void> {
    await this.client.stop();
    rmSync(this.scratchDirectory, { recursive: true, force: true });
  }
}

export function liveRunIdentifier(): string {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(16).slice(2, 8)}`;
}
