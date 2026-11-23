import * as z from "zod/v4";

import { COMMIT_HASH_PATTERN } from "../../overleaf/history/projectHistory.js";

/** A commit hash as read_history prints it; anything else is refused before Git sees it. */
export const revisionArgument = z
  .string()
  .regex(
    COMMIT_HASH_PATTERN,
    "A revision is a commit hash, 7 to 40 hexadecimal characters, as read_history prints it.",
  );
