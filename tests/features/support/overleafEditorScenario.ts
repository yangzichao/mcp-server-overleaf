import { ConnectedOverleafEditor } from "./connectedOverleafEditor.js";
import type { ServerCredentials } from "./serverCredentials.js";

/**
 * Holds the world of the scenario that is running, so step definitions shared between feature
 * files can reach it. Opened by the scenario's first step and closed after its last.
 */
export class OverleafEditorScenario {
  private openWorld: ConnectedOverleafEditor | undefined;

  get world(): ConnectedOverleafEditor {
    if (!this.openWorld) throw new Error("No step of this scenario has opened a connection to Overleaf.");
    return this.openWorld;
  }

  async open(credentials?: ServerCredentials): Promise<ConnectedOverleafEditor> {
    this.openWorld = await ConnectedOverleafEditor.open(credentials);
    return this.openWorld;
  }

  async close(): Promise<void> {
    const world = this.openWorld;
    this.openWorld = undefined;
    await world?.close();
  }
}
