import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { runSelectedOperation, type ToolOperation } from "../actions/toolOperations.js";
import type { OfferedToolGroups } from "../offeredToolGroups.js";
import { projectArgument } from "../projectArgument.js";
import { READS_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext } from "../toolContext.js";
import { compileLocally } from "./compileLocally.js";
import { compileOnOverleafServers } from "./compileOnOverleafServers.js";
import {
  BOTH_PLACES_COMPILE_DESCRIPTION,
  LOCAL_ONLY_COMPILE_DESCRIPTION,
  OVERLEAF_ONLY_COMPILE_DESCRIPTION,
} from "./compileProjectDescriptions.js";

const TITLE = "Compile the project";

const DRAFT_DESCRIPTION = "Draft mode: faster, with images replaced by boxes (default false).";
const STOP_ON_FIRST_ERROR_DESCRIPTION =
  "Stop at the first LaTeX error instead of carrying on to produce a PDF (default false, as in Overleaf).";

const COMPILE_PLACES = ["local", "overleaf"] as const;

const bothPlacesInput = z.object({
  project: projectArgument,
  where: z
    .enum(COMPILE_PLACES)
    .default("local")
    .describe(
      'Where to compile (default "local"): local runs latexmk on the clone, local edits included; overleaf compiles on Overleaf\'s servers what has been pushed.',
    ),
  mainTexFile: z
    .string()
    .optional()
    .describe(
      "Root document to compile, as a path in the project, the one containing \\begin{document}. Omitted, local guesses it from the project layout and says so if the guess has no document environment, and overleaf uses the main document set in Overleaf's menu.",
    ),
  draft: z.boolean().optional().describe(`where overleaf only. ${DRAFT_DESCRIPTION}`),
  stopOnFirstError: z
    .boolean()
    .optional()
    .describe(`where overleaf only. ${STOP_ON_FIRST_ERROR_DESCRIPTION}`),
});

type BothPlacesInput = z.infer<typeof bothPlacesInput>;

function registerBothPlaces(server: McpServer, context: ToolContext): void {
  const places: Record<(typeof COMPILE_PLACES)[number], ToolOperation<BothPlacesInput>> = {
    local: { uses: [], run: (input) => compileLocally(context, input.project, input.mainTexFile) },
    overleaf: {
      uses: ["draft", "stopOnFirstError"],
      run: (input) =>
        compileOnOverleafServers(context, {
          project: input.project,
          mainTexFile: input.mainTexFile,
          draft: input.draft ?? false,
          stopOnFirstError: input.stopOnFirstError ?? false,
        }),
    },
  };
  server.registerTool(
    "compile_project",
    {
      title: TITLE,
      description: BOTH_PLACES_COMPILE_DESCRIPTION,
      inputSchema: bothPlacesInput,
      annotations: READS_OVERLEAF,
    },
    (input) =>
      runToolSafely(context, () =>
        runSelectedOperation(input.where, places, input, ["project", "where", "mainTexFile"]),
      ),
  );
}

function registerLocalOnly(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "compile_project",
    {
      title: TITLE,
      description: LOCAL_ONLY_COMPILE_DESCRIPTION,
      inputSchema: z.object({
        project: projectArgument,
        mainTexFile: z
          .string()
          .optional()
          .describe(
            "Path to the root .tex file, the one containing \\begin{document}. Omitted, the server guesses it from the project layout and says so if the guess has no document environment.",
          ),
      }),
      annotations: READS_OVERLEAF,
    },
    ({ project, mainTexFile }) => runToolSafely(context, () => compileLocally(context, project, mainTexFile)),
  );
}

function registerOverleafOnly(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "compile_project",
    {
      title: TITLE,
      description: OVERLEAF_ONLY_COMPILE_DESCRIPTION,
      inputSchema: z.object({
        project: projectArgument,
        mainTexFile: z
          .string()
          .optional()
          .describe(
            "Root document to compile, as a path in the project. Omit to use the main document set in Overleaf's menu.",
          ),
        draft: z.boolean().optional().describe(DRAFT_DESCRIPTION),
        stopOnFirstError: z.boolean().optional().describe(STOP_ON_FIRST_ERROR_DESCRIPTION),
      }),
      annotations: READS_OVERLEAF,
    },
    ({ project, mainTexFile, draft, stopOnFirstError }) =>
      runToolSafely(context, () =>
        compileOnOverleafServers(context, {
          project,
          mainTexFile,
          draft: draft ?? false,
          stopOnFirstError: stopOnFirstError ?? false,
        }),
      ),
  );
}

/**
 * One tool, two compilers: latexmk on the clone, and Overleaf's servers. A configuration
 * that can reach only one of them lists the tool without the choice.
 */
export function registerCompileProjectTool(
  server: McpServer,
  context: ToolContext,
  offered: OfferedToolGroups,
): void {
  if (offered.gitBridgeToolsOffered && offered.sessionCookieToolsOffered) registerBothPlaces(server, context);
  else if (offered.gitBridgeToolsOffered) registerLocalOnly(server, context);
  else registerOverleafOnly(server, context);
}
