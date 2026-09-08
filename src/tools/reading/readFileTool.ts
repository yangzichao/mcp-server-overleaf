import { resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { requireSynchronizedWithOverleaf } from "../../workflow/synchronizeWithOverleaf.js";
import { runToolSafely, type ToolContext, textResult, truncateForModel } from "../toolContext.js";

export function registerReadFileTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "read_file",
    {
      title: "Read a project file",
      description:
        "Pull from Overleaf and read text, optionally by line range. Without mode, returns plain text. mode=full returns JSON content and revision; mode=smart with previousRevision returns unchanged, a line replacement delta, or full content when the baseline is unavailable. Deltas use 1-based startLine: split the baseline on newline, splice deleteLineCount lines with change.lines, then join on newline. Never apply a delta to any other baseline. A truncated full response has no usable revision.",
      inputSchema: z.object({
        project: z
          .string()
          .optional()
          .describe("Registered name or 24-character project id; omit for default."),
        path: z.string().describe("Path relative to the project root."),
        startLine: z.number().int().positive().optional().describe("First line (1-indexed)."),
        endLine: z.number().int().positive().optional().describe("Last line (inclusive)."),
        mode: z
          .enum(["full", "smart"])
          .optional()
          .describe("Opt into revision-aware JSON; incompatible with line ranges."),
        previousRevision: z
          .string()
          .regex(/^[0-9a-f]{64}$/)
          .optional()
          .describe("Revision returned for this file to this caller; requires mode=smart."),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ project, path, startLine, endLine, mode, previousRevision }) =>
      runToolSafely(context, () => {
        if (mode && (startLine !== undefined || endLine !== undefined))
          throw new Error("Revision reads cannot use line ranges.");
        if (previousRevision && mode !== "smart") throw new Error("previousRevision requires mode=smart.");
        if (startLine !== undefined && endLine !== undefined && startLine > endLine)
          throw new Error("startLine must not exceed endLine.");
        return context.projectRegistry.withRepository(project, async (repository) => {
          await requireSynchronizedWithOverleaf(repository);
          const content = await repository.readTextFile(path);
          if (mode)
            return textResult(
              JSON.stringify(
                context.fileRevisions.read(
                  resolve(repository.repositoryDirectory, path),
                  content,
                  previousRevision,
                ),
              ),
            );
          if (startLine === undefined && endLine === undefined) return textResult(truncateForModel(content));
          const lines = content.split("\n");
          const firstLine = startLine ?? 1;
          const lastLine = Math.min(lines.length, endLine ?? lines.length);
          return textResult(
            truncateForModel(
              lines
                .slice(firstLine - 1, lastLine)
                .map((line, offset) => `${firstLine + offset}\t${line}`)
                .join("\n"),
            ),
          );
        });
      }),
  );
}
