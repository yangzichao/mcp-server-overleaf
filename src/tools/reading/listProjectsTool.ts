import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
  hasAnyOverleafCredential,
  MISSING_OVERLEAF_CREDENTIAL_MESSAGE,
} from "../../config/missingOverleafCredential.js";
import { ANY_OTHER_PROJECT } from "../projectArgument.js";
import { READS_LOCAL_CONFIGURATION } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult } from "../toolContext.js";

/**
 * Registered on every server, with or without Git integration, because it reads only the local
 * configuration and every other tool takes the names it lists.
 */
export function registerListProjectsTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "list_projects",
    {
      title: "List Overleaf projects",
      description:
        "List the Overleaf projects this server is configured to reach, marking which one is the default. " +
        "Reads local configuration only, so it answers without contacting Overleaf and proves nothing about access. " +
        "Call this when a request is ambiguous about which paper it means, or when another tool reports an unknown project. " +
        "Returns one line per registered name, marked (default) where it applies and followed by its display name when one is configured. " +
        "Any project not listed can still be reached by passing its Overleaf address as `project`.",
      inputSchema: z.object({}),
      annotations: READS_LOCAL_CONFIGURATION,
    },
    () =>
      runToolSafely(context, () => {
        if (!hasAnyOverleafCredential(context.configuration)) {
          return textResult(MISSING_OVERLEAF_CREDENTIAL_MESSAGE);
        }
        const names = context.projectRegistry.listRegisteredProjectNames();
        if (names.length === 0) {
          return textResult(`No projects are registered.\n${ANY_OTHER_PROJECT}`);
        }
        const defaultName = context.configuration.defaultProjectName;
        return textResult(
          `${names
            .map((name) => {
              const displayName = context.configuration.registeredProjects.find(
                (project) => project.projectName === name,
              )?.displayName;
              return `- ${name}${name === defaultName ? "  (default)" : ""}${displayName ? ` — ${displayName}` : ""}`;
            })
            .join("\n")}\n\n${ANY_OTHER_PROJECT}`,
        );
      }),
  );
}
