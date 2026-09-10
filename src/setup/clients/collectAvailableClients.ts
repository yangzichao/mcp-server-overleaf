import { commandLineClientTargets } from "./commandLineClientTargets.js";
import { jsonConfigurationClientTargets } from "./jsonConfigurationClientTargets.js";
import type { McpClientTarget } from "./mcpClientTarget.js";

export function allClientTargets(): readonly McpClientTarget[] {
  return [...commandLineClientTargets(), ...jsonConfigurationClientTargets()];
}

/** Only clients that are actually on this computer; setup never creates one from nothing. */
/** The id that means "write the configuration, register with nothing". */
export const NO_CLIENTS = "none";

export async function collectAvailableClients(
  requestedIds?: readonly string[],
): Promise<readonly McpClientTarget[]> {
  if (requestedIds?.includes(NO_CLIENTS)) return [];
  const candidates = requestedIds?.length
    ? allClientTargets().filter((target) => requestedIds.includes(target.id))
    : allClientTargets();
  const availability = await Promise.all(candidates.map((target) => target.isAvailable()));
  return candidates.filter((_target, index) => availability[index] === true);
}
