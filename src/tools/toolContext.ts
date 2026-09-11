import { basename, join } from "node:path";

import type { CallToolResult } from "@modelcontextprotocol/server";
import { reviewCredentialSecrets } from "../config/review/reviewCredentials.js";
import { redactSecrets } from "../config/secretRedaction.js";
import type { ServerConfiguration } from "../config/serverConfiguration.js";
import type { OverleafProjectRegistry } from "../overleaf/overleafProjectRegistry.js";

import type { FileRevisionStore } from "./reading/fileRevisions.js";

export interface ToolContext {
  readonly fileRevisions: FileRevisionStore;
  readonly configuration: ServerConfiguration;
  readonly projectRegistry: OverleafProjectRegistry;
}

/** The SDK's own tool-result shape, aliased so tool modules do not each import it. */
export type ToolTextResult = CallToolResult;

export function buildDirectoryForProject(
  configuration: ServerConfiguration,
  repositoryDirectory: string,
): string {
  return join(configuration.workspaceDirectory, ".build", basename(repositoryDirectory) || "project");
}

export function textResult(text: string): ToolTextResult {
  return { content: [{ type: "text", text }] };
}

/**
 * Turns a thrown error into a tool-level failure the model can read and react to,
 * with the Overleaf token stripped out of the message.
 */
export function runToolSafely(
  context: ToolContext,
  handler: () => ToolTextResult | Promise<ToolTextResult>,
): Promise<ToolTextResult> {
  return Promise.resolve()
    .then(handler)
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: redactSecrets(message, [
              context.configuration.overleafGitToken,
              ...context.configuration.registeredProjects.map((project) => project.overleafGitToken ?? ""),
              // The session cookie is the review tools' credential and covers the whole
              // account, so it must not travel back to the model inside a failure message.
              ...reviewCredentialSecrets(context.configuration.reviewCredentials),
            ]),
          },
        ],
        isError: true,
      };
    });
}

export function truncateForModel(text: string, maximumCharacters = 60_000): string {
  if (text.length <= maximumCharacters) return text;
  return `${text.slice(0, maximumCharacters)}\n\n[... truncated ${text.length - maximumCharacters} characters ...]`;
}
