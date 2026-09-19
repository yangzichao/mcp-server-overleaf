import { resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { requireSynchronizedWithOverleaf } from "../../workflow/synchronizeWithOverleaf.js";
import { projectArgument } from "../projectArgument.js";
import { READS_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult, truncateForModel } from "../toolContext.js";

export function registerReadFileTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "read_file",
    {
      title: "Read a project file",
      description:
        "Read a text file from the project, pulling the latest commits from Overleaf first. " +
        "Binary files are refused rather than returned as mojibake. " +
        "Three ways to call it: plain (no mode) returns the text, numbered by line when startLine/endLine are given; " +
        "mode=full returns JSON with the whole content and a revision hash to pass to a guarded edit; " +
        "mode=smart with previousRevision returns only what changed since that revision. " +
        "Use a line range to sample a large file, mode=full before editing, and mode=smart to re-read a file you have already read. " +
        "A smart delta is a 1-based line splice: split your baseline on newline, replace deleteLineCount lines at startLine with change.lines, and join on newline again. " +
        "Apply a delta only to the exact revision it was computed against. A response marked truncated carries no usable revision.",
      inputSchema: z.object({
        project: projectArgument,
        path: z.string().describe("Path to the file relative to the project root, e.g. sections/intro.tex."),
        startLine: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("First line to return, 1-indexed. Cannot be combined with mode."),
        endLine: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Last line to return, inclusive. Cannot be combined with mode."),
        mode: z
          .enum(["full", "smart"])
          .optional()
          .describe(
            'Return revision-aware JSON instead of plain text: "full" for whole content plus a revision, "smart" for a delta against previousRevision. Cannot be combined with startLine/endLine.',
          ),
        previousRevision: z
          .string()
          .regex(/^[0-9a-f]{64}$/)
          .optional()
          .describe(
            "A 64-character revision hash this server returned for this same file earlier in this session. Requires mode=smart.",
          ),
      }),
      annotations: READS_OVERLEAF,
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
