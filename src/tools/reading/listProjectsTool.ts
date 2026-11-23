import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
  hasAnyOverleafCredential,
  MISSING_OVERLEAF_CREDENTIAL_MESSAGE,
} from "../../config/missingOverleafCredential.js";
import type { OfferedToolGroups } from "../offeredToolGroups.js";
import { ANY_OTHER_PROJECT } from "../projectArgument.js";
import { READS_LOCAL_CONFIGURATION, READS_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult, truncateForModel } from "../toolContext.js";
import { describeAccountProjects } from "./describeAccountProjects.js";

const CONFIGURED_ONLY_DESCRIPTION =
  "List the Overleaf projects this server is configured to reach, marking which one is the default. " +
  "Reads local configuration only, so it answers without contacting Overleaf and proves nothing about access. " +
  "Call this when a request is ambiguous about which paper it means, or when another tool reports an unknown project. " +
  "Returns one line per registered name, marked (default) where it applies and followed by its display name when one is configured. " +
  "Any project not listed can still be reached by passing its Overleaf address as `project`.";

const WITH_ACCOUNT_DESCRIPTION =
  "List the Overleaf projects this server can reach: the ones configured here, marking the default, and, with the session cookie, every project the signed-in account can open, as the Overleaf dashboard lists them, with each one's access level and address. " +
  "Archived and trashed projects are left out of the account's list. " +
  "Call this when a request is ambiguous about which paper it means, or when another tool reports an unknown project; any project listed can be passed to other tools as `project`, by its registered name or its address. " +
  "nameContains narrows both lists. " +
  "Returns the registered names, marked (default) where it applies, then one line per account project, marked with its registered name where it has one.";

function describeRegisteredProjects(context: ToolContext, nameContains: string | undefined): string {
  const filter = nameContains?.trim().toLowerCase();
  const names = context.projectRegistry
    .listRegisteredProjectNames()
    .filter((name) => !filter || name.toLowerCase().includes(filter));
  if (names.length === 0) {
    return filter
      ? `No registered project has "${nameContains}" in its name.`
      : "No projects are registered.";
  }
  const defaultName = context.configuration.defaultProjectName;
  return names
    .map((name) => {
      const displayName = context.configuration.registeredProjects.find(
        (project) => project.projectName === name,
      )?.displayName;
      return `- ${name}${name === defaultName ? "  (default)" : ""}${displayName ? ` — ${displayName}` : ""}`;
    })
    .join("\n");
}

export function registerListProjectsTool(
  server: McpServer,
  context: ToolContext,
  offered: OfferedToolGroups,
): void {
  server.registerTool(
    "list_projects",
    {
      title: "List Overleaf projects",
      description: offered.sessionCookieToolsOffered ? WITH_ACCOUNT_DESCRIPTION : CONFIGURED_ONLY_DESCRIPTION,
      inputSchema: z.object({
        nameContains: z
          .string()
          .optional()
          .describe(
            "Only projects whose name contains this text, compared case-insensitively. Omit to list all.",
          ),
      }),
      annotations: offered.sessionCookieToolsOffered ? READS_OVERLEAF : READS_LOCAL_CONFIGURATION,
    },
    ({ nameContains }) =>
      runToolSafely(context, async () => {
        if (!hasAnyOverleafCredential(context.configuration)) {
          return textResult(MISSING_OVERLEAF_CREDENTIAL_MESSAGE);
        }
        const sections = [describeRegisteredProjects(context, nameContains)];
        if (context.overleafWebClient) {
          sections.push(await describeAccountProjects(context, context.overleafWebClient, nameContains));
        }
        sections.push(ANY_OTHER_PROJECT);
        return textResult(truncateForModel(sections.join("\n\n")));
      }),
  );
}
