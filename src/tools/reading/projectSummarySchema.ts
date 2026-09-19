import * as z from "zod/v4";

/**
 * The shape `project_summary` promises.
 *
 * Declaring it as an `outputSchema` means a client sees the field names and their meaning
 * before it calls, and gets the object back as `structuredContent` rather than having to
 * parse a JSON string out of a text block. Every field carries its own description because
 * several of them are easy to read as something slightly wider than they are — `mainFile`
 * is a guess, and `totalSections` covers that one file rather than the whole project.
 */
export const projectSummarySchema = z.object({
  totalFiles: z
    .number()
    .int()
    .describe("Files in the project: tracked files plus local files not yet pushed."),
  trackedFiles: z.number().int().describe("Files Overleaf already has."),
  categories: z
    .record(z.string(), z.number().int())
    .describe('File counts by kind, keyed by category: "tex", "bib", "figure" or "other".'),
  mainFile: z
    .string()
    .nullable()
    .describe(
      "Best guess at the root document, from conventional names and content; null when the project has no .tex file. Verify before relying on it.",
    ),
  totalSections: z
    .number()
    .int()
    .describe("Sectioning commands in mainFile only, not across every .tex file. 0 when mainFile is null."),
  sectionCountScope: z
    .literal("mainFile")
    .describe("States what totalSections counted, so the number is not read as a project-wide total."),
  files: z.array(z.string()).describe("The first ten file paths, sorted. Call list_files for all of them."),
  localChanges: z
    .string()
    .describe("git diff --stat for edits not yet pushed to Overleaf; empty string when there are none."),
  untrackedFiles: z
    .array(z.string())
    .describe("Files created locally that Overleaf does not have yet, excluding ignored build artifacts."),
});

export type ProjectSummary = z.infer<typeof projectSummarySchema>;
