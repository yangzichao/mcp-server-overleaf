import fc from "fast-check";

export interface WrittenBibliographyField {
  readonly name: string;
  readonly writtenParts: readonly string[];
  readonly expectedValue: string;
}

export interface WrittenBibliographyEntry {
  readonly entryType: string;
  readonly key: string;
  readonly opener: "{" | "(";
  readonly fields: readonly WrittenBibliographyField[];
}

const valueToken = fc.constantFrom(
  "word",
  " ",
  "Deep",
  "{BERT}",
  '{\\"u}',
  "\\&",
  "a{b{c}}d",
  "-",
  ":",
  "%",
  "北京",
  "𝔸",
  "10.1000/xyz",
  // An entry written inside a value is text: BibTeX looks for `@` only between entries.
  "@misc{inner, title = {x}}",
);
const delimitedInside = fc.array(valueToken, { minLength: 1, maxLength: 6 }).map((tokens) => tokens.join(""));

const valuePart = fc.oneof(
  delimitedInside.map((inside) => ({ written: `{${inside}}`, inside })),
  delimitedInside.map((inside) => ({ written: `"${inside}"`, inside })),
  fc.stringMatching(/^[0-9]{1,4}$/).map((digits) => ({ written: digits, inside: digits })),
);

const bibliographyField: fc.Arbitrary<WrittenBibliographyField> = fc
  .record({
    name: fc.stringMatching(/^[A-Za-z][A-Za-z0-9_]{0,8}$/),
    parts: fc.array(valuePart, { minLength: 1, maxLength: 3 }),
  })
  .filter(
    ({ parts }) =>
      parts
        .map((part) => part.inside)
        .join("")
        .trim() !== "",
  )
  .map(({ name, parts }) => ({
    name,
    writtenParts: parts.map((part) => part.written),
    expectedValue: parts
      .map((part) => part.inside)
      .join("")
      .trim(),
  }));

const bibliographyEntry: fc.Arbitrary<WrittenBibliographyEntry> = fc.record({
  entryType: fc.constantFrom("article", "Article", "inproceedings", "book", "misc", "ONLINE"),
  key: fc.stringMatching(/^[A-Za-z0-9:_.\-+/]{1,12}$/),
  opener: fc.constantFrom("{" as const, "(" as const),
  fields: fc.uniqueArray(bibliographyField, {
    maxLength: 4,
    selector: (field) => field.name.toLowerCase(),
  }),
});

const bibliographyFiller = fc.oneof(
  fc.stringMatching(/^[^@]{0,20}$/),
  fc.constantFrom(
    "@string{acl = {Association for Computational Linguistics}}",
    "@comment{not an entry}",
    '@preamble{"\\newcommand{\\noop}[1]{}"}',
    "% @article{commented, title = {Gone}}",
  ),
);

function renderBibliographyEntry(entry: WrittenBibliographyEntry): string {
  const closer = entry.opener === "{" ? "}" : ")";
  const fields = entry.fields.map((field) => `  ${field.name} = ${field.writtenParts.join(" # ")},\n`);
  return `@${entry.entryType}${entry.opener}${entry.key},\n${fields.join("")}${closer}`;
}

export interface RenderedBibliography {
  readonly text: string;
  readonly entryLines: readonly number[];
}

export function renderBibliography(
  pieces: ReadonlyArray<readonly [string, WrittenBibliographyEntry]>,
): RenderedBibliography {
  let text = "";
  const entryLines: number[] = [];
  for (const [filler, entry] of pieces) {
    const fillerThatCannotCommentOutTheEntry = `${filler}\n`;
    text += fillerThatCannotCommentOutTheEntry;
    entryLines.push(text.split("\n").length);
    text += `${renderBibliographyEntry(entry)}\n`;
  }
  return { text, entryLines };
}

export const bibliographyPieces = fc.array(fc.tuple(bibliographyFiller, bibliographyEntry), { maxLength: 5 });
