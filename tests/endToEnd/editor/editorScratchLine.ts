/**
 * The editor tools can only change documents that already exist, so the live run borrows one
 * line of a real document: it appends a LaTeX comment line it owns after a line that occurs
 * once, works only inside that comment, and removes it again at the end.
 */
export function findUniqueAnchorLine(documentText: string): string {
  const anchor = documentText
    .split("\n")
    .find((line) => line.trim().length >= 8 && documentText.indexOf(line) === documentText.lastIndexOf(line));
  if (!anchor) {
    throw new Error("The end-to-end document needs at least one line of 8+ characters that occurs once.");
  }
  return anchor;
}

export function scratchCommentLine(runIdentifier: string, word: string): string {
  return `% mcp-e2e ${runIdentifier} ${word}`;
}

export function threadIdFromAddCommentReply(reply: string): string {
  const match = /\(thread ([^)\s]+)\)/.exec(reply);
  if (!match?.[1]) throw new Error(`manage_comments (action add) did not report a thread id: ${reply}`);
  return match[1];
}

/** Ids of the tracked changes read_review (view tracked_changes) reports on lines that mention the given text. */
export function trackedChangeIdsMentioning(listing: string, text: string): string[] {
  return listing
    .split("\n")
    .filter((line) => line.includes(text))
    .flatMap((line) => {
      const match = /^- \[([^\]\s]+)\]/.exec(line);
      return match?.[1] ? [match[1]] : [];
    });
}
