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

export function trackedChangeIdsMentioning(listing: string, text: string): string[] {
  return listing
    .split("\n")
    .filter((line) => line.includes(text))
    .flatMap((line) => {
      const match = /^- \[([^\]\s]+)\]/.exec(line);
      return match?.[1] ? [match[1]] : [];
    });
}

/** The [message …] id read_review (view comments) shows on the line holding the given text. */
export function messageIdOnLineMentioning(commentsView: string, text: string): string {
  const line = commentsView.split("\n").find((candidate) => candidate.includes(text));
  const match = line ? /\[message ([^\]\s]+)\]/.exec(line) : null;
  if (!match?.[1]) throw new Error(`No [message …] line mentions "${text}":\n${commentsView}`);
  return match[1];
}
