import * as z from "zod/v4";

export const startLineArgument = z.number().int().positive().optional();
export const endLineArgument = z.number().int().positive().optional();

/** Shared by the clone's read_file and the editor's; each adds what else it cannot combine with. */
export const SECTION_TITLE_DESCRIPTION =
  "Read only this section of a .tex file, by its title as it appears inside the sectioning command, e.g. Introduction for \\section{Introduction}.";

export const followIncludesArgument = z
  .boolean()
  .optional()
  .describe(
    "true returns this .tex file with every file it reaches through \\input, \\include, \\subfile or \\import inlined in place, between comment lines naming each file, then lists the includes that were not found or not inlined. Combines with no other read argument.",
  );

interface ReadArguments {
  readonly path: string;
  readonly startLine?: number | undefined;
  readonly endLine?: number | undefined;
  readonly sectionTitle?: string | undefined;
  readonly mode?: "full" | "smart" | undefined;
  readonly previousRevision?: string | undefined;
  readonly revision?: string | undefined;
  readonly followIncludes?: boolean | undefined;
}

const NARROWING_ARGUMENTS = [
  "startLine",
  "endLine",
  "sectionTitle",
  "mode",
  "previousRevision",
  "revision",
] as const;

/** A flattened read is the whole document as it is now, so nothing that narrows or versions a read applies. */
function assertFollowIncludesAlone(read: ReadArguments): void {
  if (!read.followIncludes) return;
  if (!/\.tex$/i.test(read.path)) {
    throw new Error(`followIncludes works on a .tex file, and ${read.path} is not one.`);
  }
  const combined = NARROWING_ARGUMENTS.filter((name) => read[name] !== undefined);
  if (combined.length > 0) {
    throw new Error(
      `followIncludes returns the whole file with its includes inlined, so it cannot use ${combined.join(", ")}.`,
    );
  }
}

/** Refuses a combination that cannot mean one thing, before anything is read. */
export function assertCompatibleReadArguments(read: ReadArguments): void {
  assertFollowIncludesAlone(read);
  const hasLineRange = read.startLine !== undefined || read.endLine !== undefined;
  if (read.sectionTitle !== undefined && hasLineRange) {
    throw new Error("sectionTitle reads one whole section, so it cannot use startLine or endLine.");
  }
  if (read.mode && read.sectionTitle !== undefined) {
    throw new Error("sectionTitle reads return plain text, so they cannot use mode.");
  }
  if (read.mode && hasLineRange) throw new Error("Revision reads cannot use line ranges.");
  if (read.mode && read.revision)
    throw new Error("revision reads return plain text, so they cannot use mode.");
  if (read.previousRevision && read.mode !== "smart")
    throw new Error("previousRevision requires mode=smart.");
  if (read.startLine !== undefined && read.endLine !== undefined && read.startLine > read.endLine) {
    throw new Error("startLine must not exceed endLine.");
  }
}
