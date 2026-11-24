import type { McpServer } from "@modelcontextprotocol/server";

import { searchProjectFiles } from "../../latex/searchProjectFiles.js";
import { createEditorProjectSourceReader } from "../latex/editorProjectSourceReader.js";
import {
  describeSearchMatches,
  SEARCH_PROJECT_MATCHING,
  SEARCH_PROJECT_PURPOSE,
  SEARCH_PROJECT_TITLE,
  searchProjectInput,
} from "../reading/searchProjectArguments.js";
import { withReviewSession } from "../review/openReviewSession.js";
import { READS_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult } from "../toolContext.js";
import { NO_GIT_BRIDGE_NOTE } from "./editorFileArguments.js";

/** search_project on a server with only a session cookie: every editable document, read from the editor. */
export function registerEditorSearchProjectTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "search_project",
    {
      title: SEARCH_PROJECT_TITLE,
      description:
        SEARCH_PROJECT_PURPOSE +
        "Only editable documents with the extensions .tex, .ltx, .bib, .cls, .sty, .bst, .txt and .md are searched; uploaded binary files never are. " +
        `${NO_GIT_BRIDGE_NOTE} Each document is read as the editor holds it now, with pending suggestions shown as if accepted. ` +
        SEARCH_PROJECT_MATCHING,
      inputSchema: searchProjectInput,
      annotations: READS_OVERLEAF,
    },
    async ({ project, query, isRegularExpression, maximumMatches }) =>
      runToolSafely(context, () =>
        withReviewSession(context, project, async (session) => {
          const reader = createEditorProjectSourceReader(session);
          const matches = await searchProjectFiles({
            // Sorted, so maximumMatches stops at the same files a clone's sorted `git ls-files` would.
            trackedFiles: session.project.documents.map((document) => document.path).sort(),
            readTextFile: (path) => reader.readTextFile(path),
            query,
            isRegularExpression: isRegularExpression ?? false,
            maximumMatches: maximumMatches ?? 100,
          });
          return textResult(describeSearchMatches(query, matches));
        }),
      ),
  );
}
