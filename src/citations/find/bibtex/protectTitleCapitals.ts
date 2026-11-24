/**
 * Bibliography styles that set titles in sentence case lower-case every letter BibTeX can
 * reach, which turns `BERT` into `bert` and `ImageNet` into `imagenet`. Wrapping such words in
 * braces keeps their capitals. A word counts when part of it, between hyphens or slashes, has a
 * capital after its first letter, so `GPT-4`, `t-SNE` and `3D` are kept while a title-case
 * compound like `Self-Attention` is left for the style to lower-case.
 */

const WORD_CORE = /[\p{L}\p{N}](?:[\s\S]*[\p{L}\p{N}])?/u;

function hasInnerCapital(word: string): boolean {
  return word.split(/[-/]/).some((part) => /\p{Lu}/u.test([...part].slice(1).join("")));
}

function protectWord(word: string): string {
  const core = WORD_CORE.exec(word);
  if (!core || !hasInnerCapital(core[0])) return word;
  const coreEnd = core.index + core[0].length;
  return `${word.slice(0, core.index)}{${core[0]}}${word.slice(coreEnd)}`;
}

/** Braces and math carry over from one space-separated word to the next. */
interface TitleScanState {
  braceDepth: number;
  insideMath: boolean;
}

function advance(state: TitleScanState, word: string): void {
  for (let index = 0; index < word.length; index += 1) {
    const character = word[index];
    if (character === "\\") index += 1;
    else if (character === "{") state.braceDepth += 1;
    else if (character === "}") state.braceDepth = Math.max(0, state.braceDepth - 1);
    else if (character === "$") state.insideMath = !state.insideMath;
  }
}

/** A title written in capitals throughout is left alone: bracing every word would freeze it so. */
export function protectTitleCapitals(title: string): string {
  if (!/\p{Ll}/u.test(title)) return title;
  const state: TitleScanState = { braceDepth: 0, insideMath: false };
  return title
    .split(" ")
    .map((word) => {
      const protectable = state.braceDepth === 0 && !state.insideMath && !/[\\{}$]/.test(word);
      advance(state, word);
      return protectable ? protectWord(word) : word;
    })
    .join(" ");
}
