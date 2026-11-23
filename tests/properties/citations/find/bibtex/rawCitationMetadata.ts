import fc from "fast-check";

import {
  BIBTEX_FIELD_ORDER,
  type BibtexFieldName,
} from "../../../../../src/citations/find/bibtex/bibtexEntry.js";

const TEXT_PIECES = [
  "Deep",
  " ",
  "learning",
  "\t\n ",
  "BERT",
  "{BERT}",
  "&",
  "%",
  "#",
  "@",
  "@misc{x,",
  "{",
  "}",
  "\\",
  "\\&",
  "\\{",
  "\\\\",
  "<i>x</i>",
  "<jats:italic>E. coli</jats:italic>",
  "<sub>2</sub>",
  "<mml:math><mml:mi>x</mml:mi></mml:math>",
  "&amp;",
  "&lt;i&gt;y&lt;/i&gt;",
  "&#x3b1;",
  "&#1114112;",
  "é",
  "$\\alpha$",
  "--",
  "–",
  "Ünïcødé",
  "O'Neil",
  ",",
  '"',
];

const rawText = fc.array(fc.constantFrom(...TEXT_PIECES), { maxLength: 8 }).map((pieces) => pieces.join(""));

const RAW_VALUES: Partial<Record<BibtexFieldName, fc.Arbitrary<string>>> = {
  month: fc.constantFrom("May", "june", "{Sep}", "5", "05", "13", "Spring", ""),
  pages: fc.constantFrom("1–10", "12 - 15", "e1001", "100---200", "3—4", "7"),
  year: fc.constantFrom("2017", "1999", "2017-06-12", "n.d."),
  doi: fc.constantFrom(
    "10.1000/xyz",
    " 10.1109/cvpr.2016.90 ",
    "10.1000/a{b}c",
    "10.1000/50%",
    "10.1000/x\\",
  ),
  url: fc.constantFrom("https://example.org/paper?id=1#top", "https://x.org/a%20b", "https://x.org/a b"),
  eprint: fc.constantFrom("1706.03762", "hep-th/9711200v2"),
};

export const rawCitationFields: fc.Arbitrary<Partial<Record<BibtexFieldName, string>>> = fc
  .subarray([...BIBTEX_FIELD_ORDER], { maxLength: 8 })
  .chain((names) =>
    fc.tuple(...names.map((name) => (RAW_VALUES[name] ?? rawText).map((value) => [name, value] as const))),
  )
  .map((pairs) => Object.fromEntries(pairs));

export const entryType = fc.constantFrom("article", "InProceedings", "misc", "incollection", "book");
