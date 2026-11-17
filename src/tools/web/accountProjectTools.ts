import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { createAccountProject, fetchAccountProjects } from "../../overleaf/web/accountProjects.js";
import { CREATES_IN_OVERLEAF, READS_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult, truncateForModel } from "../toolContext.js";
import { requireOverleafWebClient } from "./requireOverleafWebClient.js";

/**
 * The account's projects as Overleaf's dashboard sees them, and starting a new one. Both use
 * the session cookie, which covers the whole account, unlike `list_projects`, which reports
 * only this server's configuration.
 */

const ACCESS_LEVEL_NAMES: Record<string, string> = {
  owner: "owner",
  readAndWrite: "can edit",
  review: "can review",
  readOnly: "can view",
};

export function registerAccountProjectTools(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "list_account_projects",
    {
      title: "List the projects in the Overleaf account",
      description:
        "List every project the signed-in Overleaf account can open, as the Overleaf dashboard does, with each one's access level and address. " +
        "Archived and trashed projects are left out. " +
        "Use it to find a paper that is not registered with this server; any project listed can be passed to other tools as `project` by its address. " +
        "list_projects, by contrast, reports only the projects configured here. " +
        "Returns one line per project, marked with its registered name where it has one.",
      inputSchema: z.object({
        nameContains: z
          .string()
          .optional()
          .describe(
            "Only projects whose name contains this text, compared case-insensitively. Omit to list all.",
          ),
      }),
      annotations: READS_OVERLEAF,
    },
    async ({ nameContains }) =>
      runToolSafely(context, async () => {
        const webClient = requireOverleafWebClient(context);
        const filter = nameContains?.trim().toLowerCase();
        const projects = (await fetchAccountProjects(webClient)).filter(
          (project) => !filter || project.name.toLowerCase().includes(filter),
        );
        if (projects.length === 0) {
          return textResult(
            filter
              ? `No project in the account has "${nameContains}" in its name.`
              : "The account has no projects.",
          );
        }
        const registeredNames = new Map(
          context.configuration.registeredProjects.map((project) => [
            project.overleafProjectId,
            project.projectName,
          ]),
        );
        const lines = projects.map((project) => {
          const access = ACCESS_LEVEL_NAMES[project.accessLevel] ?? project.accessLevel;
          const registered = registeredNames.get(project.projectId);
          const registeredNote = registered ? ` (registered here as ${registered})` : "";
          return `- ${project.name} — ${access} — ${webClient.baseUrl}/project/${project.projectId}${registeredNote}`;
        });
        const count = projects.length;
        return textResult(
          truncateForModel(`${count} project${count === 1 ? "" : "s"} in the account:\n${lines.join("\n")}`),
        );
      }),
  );

  server.registerTool(
    "create_project",
    {
      title: "Create an Overleaf project",
      description:
        "Create a new project in the signed-in Overleaf account, either blank (a minimal main.tex) or from Overleaf's example paper. " +
        "It appears in the account's dashboard straight away; nothing existing is changed. " +
        "Returns the new project's address, which other tools take as `project`, for example to write files into it and push them.",
      inputSchema: z.object({
        name: z
          .string()
          .trim()
          .min(1)
          .max(150)
          .describe("Name of the new project, as it will appear in the dashboard."),
        template: z
          .enum(["blank", "example"])
          .default("blank")
          .describe(
            '"blank" for a minimal document, "example" for Overleaf\'s example paper. Defaults to "blank".',
          ),
      }),
      annotations: CREATES_IN_OVERLEAF,
    },
    async ({ name, template }) =>
      runToolSafely(context, async () => {
        const webClient = requireOverleafWebClient(context);
        const projectId = await createAccountProject(webClient, name, template);
        return textResult(
          `Created the project "${name}" at ${webClient.baseUrl}/project/${projectId}. ` +
            "Pass that address as `project` to read, edit or push to it.",
        );
      }),
  );
}
