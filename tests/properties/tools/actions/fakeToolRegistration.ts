import type * as z from "zod/v4";

import type { OfferedToolGroups } from "../../../../src/tools/offeredToolGroups.js";
import { registerOverleafTools } from "../../../../src/tools/registerOverleafTools.js";
import type { ToolTextResult } from "../../../../src/tools/toolContext.js";

const FAKE_CONTEXT_USED = "FAKE_CONTEXT_USED";

export interface RegisteredTool {
  readonly name: string;
  readonly inputSchema: z.ZodObject<z.ZodRawShape>;
  readonly handler: (input: Record<string, unknown>) => Promise<ToolTextResult>;
}

function refusingProxy<T extends object>(known: T): T {
  return new Proxy(known, {
    get(target, property) {
      if (property in target) return target[property as keyof T];
      if (property === "then") return undefined;
      throw new Error(`${FAKE_CONTEXT_USED}: ${String(property)}`);
    },
  });
}

export function registeredTools(offered: OfferedToolGroups): RegisteredTool[] {
  const configuration = refusingProxy({
    overleafGitToken: "",
    registeredProjects: [],
    reviewCredentials: undefined,
  });
  const context = refusingProxy({ configuration });
  const tools: RegisteredTool[] = [];
  const server = {
    registerTool: (
      name: string,
      config: { inputSchema?: RegisteredTool["inputSchema"] },
      handler: RegisteredTool["handler"],
    ) => {
      if (config.inputSchema) tools.push({ name, inputSchema: config.inputSchema, handler });
    },
  };
  registerOverleafTools(server as never, context as never, offered);
  return tools;
}

export function resultText(result: ToolTextResult): string {
  const first = result.content[0];
  return first?.type === "text" ? first.text : "";
}
