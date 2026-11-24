import { normalizeTitleWords } from "./titleSimilarity.js";

/**
 * Whether a registry's author list includes the family name a .bib entry gives. Both sides go
 * through the same normalisation as titles, so `M{\"u}ller` and `Müller` agree, and a
 * particle on one side only ("van der Berg" against "Berg") still matches.
 */

function sameFamilyName(left: string, right: string): boolean {
  const leftWords = normalizeTitleWords(left);
  const rightWords = normalizeTitleWords(right);
  if (leftWords.length === 0 || rightWords.length === 0) return false;
  return (
    leftWords.every((word) => rightWords.includes(word)) ||
    rightWords.every((word) => leftWords.includes(word))
  );
}

export function listsAuthor(authorNames: readonly string[], familyName: string): boolean {
  return authorNames.some((name) => sameFamilyName(name, familyName));
}
