import type { McpClientOptions } from "../../integration/mcpStdioClient.js";
import { ConnectedOverleafEditor } from "./connectedOverleafEditor.js";
import type { ServerCredentials } from "./serverCredentials.js";

export class OverleafEditorScenario {
  private openWorld: ConnectedOverleafEditor | undefined;

  get world(): ConnectedOverleafEditor {
    if (!this.openWorld) throw new Error("No step of this scenario has opened a connection to Overleaf.");
    return this.openWorld;
  }

  async open(
    credentials?: ServerCredentials,
    environmentOverrides?: NodeJS.ProcessEnv,
    clientOptions?: McpClientOptions,
  ): Promise<ConnectedOverleafEditor> {
    this.openWorld = await ConnectedOverleafEditor.open(credentials, environmentOverrides, clientOptions);
    return this.openWorld;
  }

  async close(): Promise<void> {
    const world = this.openWorld;
    this.openWorld = undefined;
    await world?.close();
  }
}
