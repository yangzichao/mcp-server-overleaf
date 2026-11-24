/**
 * The seven numbers texcount gives a document, labelled the same way whether texcount ran on
 * Overleaf's compile servers or in the local clone, so the two word_count replies read alike.
 */
export interface WordCountTotals {
  readonly textWords: number;
  readonly headingWords: number;
  /** Words in captions and other text outside the running text. */
  readonly wordsOutsideText: number;
  readonly headingCount: number;
  readonly floatCount: number;
  readonly inlineMathCount: number;
  readonly displayMathCount: number;
}

export function describeWordCountTotals(totals: WordCountTotals): string[] {
  return [
    `Words in text: ${totals.textWords}`,
    `Words in headings: ${totals.headingWords}`,
    `Words outside text (captions and the like): ${totals.wordsOutsideText}`,
    `Headings: ${totals.headingCount}`,
    `Floats (figures, tables and the like): ${totals.floatCount}`,
    `Inline math: ${totals.inlineMathCount}`,
    `Displayed math: ${totals.displayMathCount}`,
  ];
}
