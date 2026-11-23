import fc from "fast-check";

/**
 * DOIs and arXiv ids as people paste them into a citation search: bare, after a prefix, inside
 * a link, around it whatever whitespace a copy brings along.
 */

const surroundingSpace = fc.constantFrom("", " ", "  ", "\n", "\t ", " \n");

function surrounded(written: fc.Arbitrary<string>): fc.Arbitrary<string> {
  return fc.tuple(surroundingSpace, written, surroundingSpace).map((parts) => parts.join(""));
}

const DOI_SUFFIX_PIECES = [
  "nature14539",
  "(SICI)",
  "1097-4636",
  "35:4<487::AID-JBM8>",
  "3.0.CO;2-P",
  "a.b",
  "_",
  "/",
  "x",
  "É",
];

/** arXiv's own DOIs, under 10.48550, are read as arXiv ids, so they are left to the arXiv properties. */
export const doi: fc.Arbitrary<string> = fc
  .tuple(
    fc.stringMatching(/^[0-9]{4,9}$/).filter((registrant) => registrant !== "48550"),
    fc.array(fc.constantFrom(...DOI_SUFFIX_PIECES), { minLength: 1, maxLength: 4 }),
  )
  .map(([registrant, suffix]) => `10.${registrant}/${suffix.join("")}`);

const DOI_FORMS = [
  (written: string) => written,
  (written: string) => `doi:${written}`,
  (written: string) => `DOI: ${written}`,
  (written: string) => `https://doi.org/${written}`,
  (written: string) => `http://dx.doi.org/${written}`,
  (written: string) => `HTTPS://DOI.ORG/${written}`,
  (written: string) => `doi.org/${written}`,
];

export function writtenDoi(written: string): fc.Arbitrary<string> {
  return surrounded(fc.constantFrom(...DOI_FORMS).map((form) => form(written)));
}

export interface ArxivIdentifier {
  /** As arXiv writes it: archive in lower case, subject class in upper case, `v` in lower case. */
  readonly canonical: string;
  readonly versioned: boolean;
}

const version = fc.option(fc.integer({ min: 1, max: 12 }), { nil: undefined });

const newArxivId = fc
  .tuple(fc.stringMatching(/^[0-9]{4}\.[0-9]{4,5}$/), version)
  .map(([number, chosenVersion]) => ({ number, chosenVersion }));

const OLD_ARCHIVES = ["hep-th", "cond-mat", "astro-ph", "q-bio", "math", "cs", "math.GT", "math.AG", "cs.AI"];

const oldArxivId = fc
  .tuple(fc.constantFrom(...OLD_ARCHIVES), fc.stringMatching(/^[0-9]{7}$/), version)
  .map(([archive, digits, chosenVersion]) => ({ number: `${archive}/${digits}`, chosenVersion }));

export const arxivIdentifier: fc.Arbitrary<ArxivIdentifier> = fc
  .oneof(newArxivId, oldArxivId)
  .map(({ number, chosenVersion }) => ({
    canonical: chosenVersion === undefined ? number : `${number}v${chosenVersion}`,
    versioned: chosenVersion !== undefined,
  }));

/** The text with each letter in either case, as an id typed by hand or lower-cased by a tool may be. */
function inAnyCase(text: string): fc.Arbitrary<string> {
  const characters = [...text];
  return fc
    .array(fc.boolean(), { minLength: characters.length, maxLength: characters.length })
    .map((upper) =>
      characters
        .map((character, index) => (upper[index] ? character.toUpperCase() : character.toLowerCase()))
        .join(""),
    );
}

const ARXIV_FORMS = [
  (written: string) => written,
  (written: string) => `arXiv:${written}`,
  (written: string) => `ARXIV: ${written}`,
  (written: string) => `arxiv ${written}`,
  (written: string) => `https://arxiv.org/abs/${written}`,
  (written: string) => `http://arxiv.org/pdf/${written}.pdf`,
  (written: string) => `https://export.arxiv.org/abs/${written}?context=cs`,
  (written: string) => `www.arxiv.org/abs/${written}/`,
  (written: string) => `https://arxiv.org/abs/${written}#comments`,
];

/** arXiv's DOIs name a paper, not one of its versions. */
const ARXIV_DOI_FORMS = [
  (written: string) => `10.48550/arXiv.${written}`,
  (written: string) => `https://doi.org/10.48550/ARXIV.${written}`,
];

export function writtenArxivId(identifier: ArxivIdentifier): fc.Arbitrary<string> {
  const forms = identifier.versioned ? ARXIV_FORMS : [...ARXIV_FORMS, ...ARXIV_DOI_FORMS];
  return surrounded(
    fc.tuple(fc.constantFrom(...forms), inAnyCase(identifier.canonical)).map(([form, id]) => form(id)),
  );
}
