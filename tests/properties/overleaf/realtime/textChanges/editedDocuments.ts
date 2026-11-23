import fc from "fast-check";

/**
 * A document and an edit of it, built from a few lines that repeat, so a diff has to choose
 * which copy of a line stayed, with emoji, CRLF line ends and text that differs in one character.
 */

const LINE_TEXTS = [
  "\\item x",
  "\\item y",
  "",
  "  % note",
  "a",
  "b",
  "é",
  "\u{1F600}",
  "\u{1F601}x",
  "c c",
  "\\end{x}",
];

const line = fc
  .tuple(fc.constantFrom(...LINE_TEXTS), fc.constantFrom("\n", "\n", "\r\n"))
  .map((parts) => parts.join(""));

export const documentLines = fc.array(line, { maxLength: 12 });

/** Joins lines into a text whose last line may lack its line end, as a file's often does. */
export function asText(lines: readonly string[], endsWithLineEnd: boolean): string {
  const text = lines.join("");
  return endsWithLineEnd ? text : text.replace(/\r?\n$/, "");
}

export const editedDocument = fc.record({
  oldLines: documentLines,
  newLines: documentLines,
  oldEndsWithLineEnd: fc.boolean(),
  newEndsWithLineEnd: fc.boolean(),
});

export interface SmallEdit {
  readonly oldText: string;
  readonly newText: string;
  /** How many UTF-16 code units the edit deleted and inserted. */
  readonly editedLength: number;
}

/** A few characters deleted and inserted at `start`, counted in code points so no pair is split. */
function smallEditAt(characters: readonly string[], start: fc.Arbitrary<number>): fc.Arbitrary<SmallEdit> {
  return fc
    .record({
      start,
      deleteCount: fc.nat(3),
      inserted: fc.constantFrom("", "z", "\n", "\u{1F602}", "\r\n", "é"),
    })
    .map(({ start: at, deleteCount, inserted }) => {
      const deleted = characters.slice(at, at + deleteCount).join("");
      return {
        oldText: characters.join(""),
        newText: characters.slice(0, at).join("") + inserted + characters.slice(at + deleteCount).join(""),
        editedLength: deleted.length + inserted.length,
      };
    });
}

/** Lines of a list, which repeat and share their ends, as LaTeX's often do. */
const listLines = fc.array(fc.constantFrom("\\item x\n", "\\item y\n", "\\item x y\n", "\\end{x}\n", "\n"), {
  maxLength: 8,
});

/** Where each line end is, as an index into the text's characters. */
function lineEndIndexes(characters: readonly string[]): number[] {
  return characters.flatMap((character, index) => (character === "\n" ? [index] : []));
}

/**
 * A text and the same text with a small edit, often around a line end, where an edit joins or
 * splits lines and so can make a line that its neighbour already is.
 */
export const textWithSmallEdit: fc.Arbitrary<SmallEdit> = fc
  .tuple(fc.oneof(documentLines, listLines), fc.boolean())
  .map(([lines, endsWithLineEnd]) => [...asText(lines, endsWithLineEnd)])
  .chain((characters) =>
    smallEditAt(
      characters,
      fc.oneof(
        fc.nat(characters.length),
        fc
          .constantFrom(-1, ...lineEndIndexes(characters))
          .chain((lineEnd) => fc.integer({ min: Math.max(0, lineEnd - 2), max: Math.max(0, lineEnd + 1) })),
      ),
    ),
  );
