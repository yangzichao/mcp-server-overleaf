import { expect } from "vitest";

import type { McpToolDescription } from "./mcpProtocol.js";

/** Tool names, plus every action, view and place a listed tool accepts, such as replace_section. */
export function namesTheModelCanUse(tools: readonly McpToolDescription[]): Set<string> {
  const names = new Set<string>();
  for (const tool of tools) {
    names.add(tool.name);
    for (const selector of ["action", "view", "where"]) {
      const property = tool.inputSchema.properties?.[selector] as { enum?: string[] } | undefined;
      for (const value of property?.enum ?? []) names.add(value);
    }
  }
  return names;
}

/**
 * Every snake_case word in the server instructions has to be a listed tool or an action or view
 * of one, or the model is told to call something that does not exist.
 */
export function expectInstructionsToNameOnlyWhatIsListed(
  instructions: string,
  tools: readonly McpToolDescription[],
): void {
  const usable = namesTheModelCanUse(tools);
  for (const named of instructions.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? []) {
    expect(usable, `instructions name ${named}`).toContain(named);
  }
}
