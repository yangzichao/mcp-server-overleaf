import fc from "fast-check";

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
  readonly deletedAndInsertedCodeUnits: number;
}

function smallEditAt(codePoints: readonly string[], start: fc.Arbitrary<number>): fc.Arbitrary<SmallEdit> {
  return fc
    .record({
      start,
      deleteCount: fc.nat(3),
      inserted: fc.constantFrom("", "z", "\n", "\u{1F602}", "\r\n", "é"),
    })
    .map(({ start: at, deleteCount, inserted }) => {
      const deleted = codePoints.slice(at, at + deleteCount).join("");
      return {
        oldText: codePoints.join(""),
        newText: codePoints.slice(0, at).join("") + inserted + codePoints.slice(at + deleteCount).join(""),
        deletedAndInsertedCodeUnits: deleted.length + inserted.length,
      };
    });
}

const listLines = fc.array(fc.constantFrom("\\item x\n", "\\item y\n", "\\item x y\n", "\\end{x}\n", "\n"), {
  maxLength: 8,
});

function lineEndIndexes(codePoints: readonly string[]): number[] {
  return codePoints.flatMap((codePoint, index) => (codePoint === "\n" ? [index] : []));
}

export const textWithSmallEdit: fc.Arbitrary<SmallEdit> = fc
  .tuple(fc.oneof(documentLines, listLines), fc.boolean())
  .map(([lines, endsWithLineEnd]) => [...asText(lines, endsWithLineEnd)])
  .chain((codePoints) =>
    smallEditAt(
      codePoints,
      fc.oneof(
        fc.nat(codePoints.length),
        fc
          .constantFrom(-1, ...lineEndIndexes(codePoints))
          .chain((lineEnd) => fc.integer({ min: Math.max(0, lineEnd - 2), max: Math.max(0, lineEnd + 1) })),
      ),
    ),
  );
