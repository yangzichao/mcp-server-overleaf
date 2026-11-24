import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
  hasAnyOverleafCredential,
  MISSING_OVERLEAF_CREDENTIAL_MESSAGE,
} from "../../config/missingOverleafCredential.js";
import type { OfferedToolGroups } from "../offeredToolGroups.js";
import { ANY_OTHER_PROJECT } from "../projectArgument.js";
import { READS_LOCAL_CONFIGURATION, READS_OVERLEAF } from "../toolAnnotations.js";
import {
  runToolSafely,
  type ToolContext,
  type ToolTextResult,
  textResult,
  truncateForModel,
} from "../toolContext.js";
import { requireOverleafWebClient } from "../web/requireOverleafWebClient.js";
import { ACCOUNT_PROJECT_FILTERS } from "./accountProjectFilters.js";
import { type AccountProjectQuery, describeAccountProjects } from "./describeAccountProjects.js";

const TITLE = "List Overleaf projects";

const CONFIGURED_ONLY_DESCRIPTION =
  "List the Overleaf projects this server is configured to reach, marking which one is the default. " +
  "Reads local configuration only, so it answers without contacting Overleaf and proves nothing about access. " +
  "Call this when a request is ambiguous about which paper it means, or when another tool reports an unknown project. " +
  "Returns one line per registered name, marked (default) where it applies and followed by its display name when one is configured. " +
  "Any project not listed can still be reached by passing its Overleaf address as `project`.";

const WITH_ACCOUNT_DESCRIPTION =
  "List the Overleaf projects this server can reach: the ones configured here, marking the default, and, with the session cookie, the signed-in account's projects as Overleaf's dashboard lists them, each with its access level, address and tags. " +
  "filter picks the dashboard list: all, the default, leaves out archived and trashed projects as the dashboard does; owned, shared, archived and trashed give those lists, where archive and trash are this account's own. " +
  "tag keeps the projects carrying that tag. A filter other than all, or a tag, lists the account's projects alone, without the configured ones; nameContains narrows every list. " +
  "Call this when a request is ambiguous about which paper it means, or when another tool reports an unknown project; any project listed can be passed to other tools as `project`, by its registered name or its address. " +
  "filter and tag need the session cookie; a tag the account does not have is reported along with the tags it does have. " +
  "Returns the registered names, marked (default) where it applies, then one line per account project, marked with its registered name where it has one.";

const nameContainsArgument = z
  .string()
  .optional()
  .describe("Only projects whose name contains this text, compared case-insensitively. Omit to list all.");

const configuredOnlyInput = z.object({ nameContains: nameContainsArgument });

const withAccountInput = z.object({
  nameContains: nameContainsArgument,
  filter: z
    .enum(ACCOUNT_PROJECT_FILTERS)
    .optional()
    .describe(
      "Which of the account's projects to list, as Overleaf's dashboard groups them: all (default; leaves out archived and trashed projects), owned (by this account), shared (owned by someone else), archived or trashed.",
    ),
  tag: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .optional()
    .describe(
      "Only the account's projects carrying this tag, one of the folders of Overleaf's project list, matched case-insensitively. Combines with filter and nameContains.",
    ),
});

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

/** The configured projects and the account's, or the account's alone for a dashboard list or tag. */
async function listProjects(context: ToolContext, query: AccountProjectQuery): Promise<ToolTextResult> {
  if (!hasAnyOverleafCredential(context.configuration)) {
    return textResult(MISSING_OVERLEAF_CREDENTIAL_MESSAGE);
  }
  const accountOnly = query.filter !== "all" || query.tag !== undefined;
  const sections = accountOnly ? [] : [describeRegisteredProjects(context, query.nameContains)];
  const webClient = accountOnly ? requireOverleafWebClient(context) : context.overleafWebClient;
  if (webClient) sections.push(await describeAccountProjects(context, webClient, query));
  sections.push(ANY_OTHER_PROJECT);
  return textResult(truncateForModel(sections.join("\n\n")));
}

export function registerListProjectsTool(
  server: McpServer,
  context: ToolContext,
  offered: OfferedToolGroups,
): void {
  if (offered.sessionCookieToolsOffered) {
    server.registerTool(
      "list_projects",
      {
        title: TITLE,
        description: WITH_ACCOUNT_DESCRIPTION,
        inputSchema: withAccountInput,
        annotations: READS_OVERLEAF,
      },
      ({ nameContains, filter, tag }) =>
        runToolSafely(context, () => listProjects(context, { nameContains, filter: filter ?? "all", tag })),
    );
    return;
  }
  server.registerTool(
    "list_projects",
    {
      title: TITLE,
      description: CONFIGURED_ONLY_DESCRIPTION,
      inputSchema: configuredOnlyInput,
      annotations: READS_LOCAL_CONFIGURATION,
    },
    ({ nameContains }) =>
      runToolSafely(context, () => listProjects(context, { nameContains, filter: "all", tag: undefined })),
  );
}
