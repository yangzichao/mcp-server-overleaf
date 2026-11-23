/**
 * Whether a title in a .bib file and a title a registry holds name the same work. LaTeX
 * markup, accents, JATS tags, letter case and punctuation are all noise here; the words are
 * what count.
 */

export function normalizeTitleWords(title: string): string[] {
  return title
    .replace(/<[^<>]+>/g, " ")
    .replace(/\\[a-zA-Z]+\*?/g, " ")
    .replace(/\\./g, "")
    .replace(/[{}$]/g, "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word !== "");
}

function countCommonWords(left: readonly string[], right: readonly string[]): number {
  const remaining = new Map<string, number>();
  for (const word of right) remaining.set(word, (remaining.get(word) ?? 0) + 1);
  let common = 0;
  for (const word of left) {
    const count = remaining.get(word) ?? 0;
    if (count > 0) {
      common += 1;
      remaining.set(word, count - 1);
    }
  }
  return common;
}

/** A title this short could match too much by containment alone. */
const MINIMUM_WORDS_FOR_CONTAINMENT = 4;

/**
 * Between 0 and 1. Word overlap (Dice), or, when one title is the other with a subtitle
 * left off, how much of the shorter one the longer contains.
 */
export function titleSimilarity(leftTitle: string, rightTitle: string): number {
  const left = normalizeTitleWords(leftTitle);
  const right = normalizeTitleWords(rightTitle);
  if (left.length === 0 || right.length === 0) return 0;
  const common = countCommonWords(left, right);
  const dice = (2 * common) / (left.length + right.length);
  const shorter = Math.min(left.length, right.length);
  const containment = shorter >= MINIMUM_WORDS_FOR_CONTAINMENT ? common / shorter : 0;
  return Math.max(dice, containment);
}

/** At or above this, the titles are taken to name the same work. */
export const SAME_WORK_THRESHOLD = 0.8;
