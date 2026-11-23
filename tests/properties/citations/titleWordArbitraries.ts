import fc from "fast-check";

/** Plain ASCII title words, so case changes cannot alter a word's length or letters. */
export const titleWord = fc.stringMatching(/^[A-Za-z0-9]{1,8}$/);

const ACCENTED_FORMS: Record<string, readonly string[]> = {
  a: ["á", "à", "ä", "{\\'a}", "{\\`a}", '{\\"a}'],
  e: ["é", "è", "{\\'e}", "{\\^e}"],
  o: ["ö", "ó", '{\\"o}', "{\\'o}"],
  u: ["ü", "ú", '{\\"u}'],
};

const WRAPPINGS = {
  plain: (written: string) => written,
  braces: (written: string) => `{${written}}`,
  emph: (written: string) => `\\emph{${written}}`,
  textbf: (written: string) => `\\textbf{${written}}`,
  italicTag: (written: string) => `<i>${written}</i>`,
  math: (written: string) => `$${written}$`,
} as const;

function withAccent(word: string, vowelIndex: number | undefined, accentChoice: number): string {
  const vowel = vowelIndex === undefined ? undefined : word[vowelIndex];
  const forms = vowel === undefined ? undefined : ACCENTED_FORMS[vowel];
  if (!forms || vowelIndex === undefined) return word;
  const characters = [...word];
  characters[vowelIndex] = forms[accentChoice % forms.length] ?? characters[vowelIndex] ?? "";
  return characters.join("");
}

/**
 * The same word as a .bib file or a registry might write it: wrapped in braces or a markup
 * command, in upper case, or with an accent on a lower-case vowel.
 */
export function decoratedWord(word: string): fc.Arbitrary<string> {
  const vowelIndexes = [...word].flatMap((character, index) => (ACCENTED_FORMS[character] ? [index] : []));
  return fc
    .record({
      wrapping: fc.constantFrom(...(Object.keys(WRAPPINGS) as Array<keyof typeof WRAPPINGS>)),
      upperCase: fc.boolean(),
      vowelIndex: fc.option(fc.constantFrom(...vowelIndexes, -1), { nil: undefined }),
      accentChoice: fc.nat(5),
    })
    .map(({ wrapping, upperCase, vowelIndex, accentChoice }) => {
      const written = upperCase
        ? word.toUpperCase()
        : withAccent(word, vowelIndex === -1 ? undefined : vowelIndex, accentChoice);
      return WRAPPINGS[wrapping](written);
    });
}

const wordSeparator = fc.constantFrom(" ", "  ", ": ", ", ", " -- ", "\n", "~");

export function decoratedTitle(words: readonly string[]): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.tuple(...words.map(decoratedWord)),
      fc.array(wordSeparator, { minLength: words.length, maxLength: words.length }),
    )
    .map(([decorated, separators]) =>
      decorated.map((word, index) => (index === 0 ? word : `${separators[index] ?? " "}${word}`)).join(""),
    );
}
