import * as z from "zod/v4";

export const expectedRevisionArgument = z
  .string()
  .regex(/^[0-9a-f]{64}$/)
  .optional()
  .describe(
    "Every action, optional guard: the 64-character revision hash returned by read_file with mode=full or mode=smart for this same file. " +
      "When given, the edit is refused if the file changed since that read, for example because pulling from Overleaf brought in a collaborator's version. " +
      "Pass it whenever the edit depends on content you read earlier; leave it out when creating a file.",
  );

/** Ends every reply that changed the clone, so the next two steps are never a guess. */
export const EDITS_ARE_LOCAL_UNTIL_PUSHED =
  "The edit is written to the local clone only. Review it with read_project (view changes), then call push_changes to publish it to Overleaf.";
