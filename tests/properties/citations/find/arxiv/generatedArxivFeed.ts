import fc from "fast-check";

import type { ArxivPaperRecord } from "../../../../../src/citations/find/arxiv/parseArxivPaper.js";

export interface GeneratedArxivFeed {
  readonly paper: ArxivPaperRecord;
  readonly feed: string;
}

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

export function escapedXmlText(text: string): fc.Arbitrary<string> {
  const characters = [...text];
  return fc
    .array(fc.boolean(), { minLength: characters.length, maxLength: characters.length })
    .map((numericChoices) =>
      characters
        .map((character, index) =>
          numericChoices[index]
            ? `&#${character.codePointAt(0) ?? 0};`
            : (XML_ESCAPES[character] ?? character),
        )
        .join(""),
    );
}

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const phrase = (pieces: readonly string[]) =>
  fc
    .array(fc.constantFrom(...pieces), { minLength: 1, maxLength: 6 })
    .map((chosen) => chosen.join(""))
    .filter((text) => collapseWhitespace(text) !== "");

const title = phrase([
  "Attention",
  " ",
  "Is",
  "All",
  "\n  ",
  "&",
  "<b>",
  "'",
  '"',
  "北京",
  "𝔸",
  "Q&A",
  "&#65;",
]).filter((text) => collapseWhitespace(text) !== "Error");
const authorName = phrase(["Ashish", " ", "Vaswani", "Łukasz", "O'Neil", "&", "<x>", "\t", "Ж"]);
const versionedId = fc.oneof(
  fc
    .tuple(fc.stringMatching(/^[0-9]{4}\.[0-9]{4,5}$/), fc.integer({ min: 1, max: 12 }))
    .map(([id, version]) => `${id}v${version}`),
  fc
    .tuple(
      fc.constantFrom("hep-th", "math", "cond-mat"),
      fc.stringMatching(/^[0-9]{7}$/),
      fc.integer({ min: 1, max: 9 }),
    )
    .map(([archive, number, version]) => `${archive}/${number}v${version}`),
);
const category = fc.constantFrom("cs.CL", "cs.LG", "hep-th", "math.GT", "q-bio.NC");
const optionalText = (pieces: readonly string[]) => fc.option(phrase(pieces), { nil: undefined });
const indentation = fc.constantFrom("", "\n", "\n    ", " ");

const feedParts = fc.record({
  versionedId,
  title,
  authorNames: fc.array(authorName, { maxLength: 3 }),
  published: fc.option(fc.constantFrom("2017-06-12T17:57:34Z", "1997-11-27T21:11:41Z"), { nil: undefined }),
  primaryCategory: fc.option(category, { nil: undefined }),
  otherCategories: fc.array(category, { maxLength: 2 }),
  doi: optionalText(["10.1023/A:1026654312961", "10.1000/x<y>"]),
  journalReference: optionalText(["Adv.Theor.Math.Phys.2:231-252,1998", " ", "&", "Phys. Rev."]),
  indentation,
});

type FeedParts = typeof feedParts extends fc.Arbitrary<infer Parts> ? Parts : never;

interface EscapedParts {
  readonly title: string;
  readonly authorNames: readonly string[];
  readonly doi: string | undefined;
  readonly journalReference: string | undefined;
}

function escapedParts(parts: FeedParts): fc.Arbitrary<EscapedParts> {
  return fc.record({
    title: escapedXmlText(parts.title),
    authorNames: fc.tuple(...parts.authorNames.map(escapedXmlText)),
    doi: parts.doi === undefined ? fc.constant(undefined) : escapedXmlText(parts.doi),
    journalReference:
      parts.journalReference === undefined ? fc.constant(undefined) : escapedXmlText(parts.journalReference),
  });
}

const ATOM = 'xmlns:arxiv="http://arxiv.org/schemas/atom"';

function renderFeed(parts: FeedParts, escaped: EscapedParts): string {
  const space = parts.indentation;
  const element = (name: string, text: string | undefined, attributes = "") =>
    text === undefined ? [] : [`<${name}${attributes}>${space}${text}${space}</${name}>`];
  const categories = [
    ...(parts.primaryCategory === undefined
      ? []
      : [
          `<arxiv:primary_category ${ATOM} term="${parts.primaryCategory}" scheme="http://arxiv.org/schemas/atom"/>`,
        ]),
    ...parts.otherCategories.map(
      (term) => `<category term="${term}" scheme="http://arxiv.org/schemas/atom"/>`,
    ),
  ];
  const entry = [
    "<entry>",
    ...element("id", `http://arxiv.org/abs/${parts.versionedId}`),
    "<updated>2023-08-02T00:41:18Z</updated>",
    ...element("published", parts.published),
    ...element("title", escaped.title),
    "<summary>  An abstract.</summary>",
    ...escaped.authorNames.map((name) => `<author>${space}<name>${name}</name>${space}</author>`),
    ...element("arxiv:doi", escaped.doi, ` ${ATOM}`),
    ...element("arxiv:journal_ref", escaped.journalReference, ` ${ATOM}`),
    `<link href="http://arxiv.org/abs/${parts.versionedId}" rel="alternate" type="text/html"/>`,
    ...categories,
    "</entry>",
  ];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    '<title type="html">ArXiv Query: search_query=&amp;id_list=1706.03762</title>',
    "<id>http://arxiv.org/api/cHxbiOdZaP56ODnBPIenZhzg5f8</id>",
    ...entry,
    "</feed>",
  ].join(space === "" ? "" : "\n");
}

export const arxivFeed: fc.Arbitrary<GeneratedArxivFeed> = feedParts.chain((parts) =>
  escapedParts(parts).map((escaped) => ({
    feed: renderFeed(parts, escaped),
    paper: {
      versionedId: parts.versionedId,
      title: collapseWhitespace(parts.title),
      authorNames: parts.authorNames.map(collapseWhitespace),
      published: parts.published,
      primaryCategory: parts.primaryCategory ?? parts.otherCategories[0],
      doi: parts.doi === undefined ? undefined : collapseWhitespace(parts.doi),
      journalReference:
        parts.journalReference === undefined ? undefined : collapseWhitespace(parts.journalReference),
    },
  })),
);
