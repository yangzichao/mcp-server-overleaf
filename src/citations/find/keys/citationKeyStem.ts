import type { BibtexEntryDraft } from "../bibtex/bibtexEntry.js";

/**
 * Citation keys in the form Google Scholar made familiar: the first author's family name, the
 * year, and the first word of the title that is not a stopword, as `vaswani2017attention`. Keys
 * are lower-case ASCII letters and digits, which every BibTeX and biber version reads.
 */

const TITLE_STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "on",
  "of",
  "in",
  "for",
  "and",
  "to",
  "with",
  "from",
  "by",
  "at",
  "as",
  "is",
  "are",
  "via",
  "toward",
  "towards",
  "into",
  "onto",
  "over",
  "about",
]);

/** LaTeX commands that stand for a letter rather than put an accent on one. */
const LATEX_LETTERS: Record<string, string> = {
  ss: "ss",
  ae: "ae",
  AE: "AE",
  oe: "oe",
  OE: "OE",
  aa: "aa",
  AA: "AA",
  o: "o",
  O: "O",
  l: "l",
  L: "L",
  i: "i",
  j: "j",
};

/** Letters Unicode does not decompose into a base letter and an accent. */
const UNDECOMPOSABLE_LETTERS: Record<string, string> = {
  ø: "o",
  Ø: "O",
  ß: "ss",
  æ: "ae",
  Æ: "AE",
  œ: "oe",
  Œ: "OE",
  ł: "l",
  Ł: "L",
  đ: "d",
  Đ: "D",
  ð: "d",
  Ð: "D",
  þ: "th",
  Þ: "Th",
  ı: "i",
};

/** The words of a name or title in lower-case ASCII: accents dropped, LaTeX markup and math removed. */
export function asciiWords(text: string): string[] {
  return text
    .replace(/\$[^$]*\$/g, " ")
    .replace(
      /\\(ss|ae|AE|oe|OE|aa|AA|o|O|l|L|i|j)(?![A-Za-z])/g,
      (_, name: string) => LATEX_LETTERS[name] ?? "",
    )
    .replace(/\\[A-Za-z]+\*?/g, "")
    .replace(/\\["'`^~=.]/g, "")
    .replace(/\\[^A-Za-z]/g, " ")
    .replace(/[{}]/g, "")
    .replace(/[øØßæÆœŒłŁđĐðÐþÞı]/g, (letter) => UNDECOMPOSABLE_LETTERS[letter] ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== "");
}

/** Splits where `separator` (a sticky pattern) matches outside braces, so `{Barnes and Noble}` stays one name. */
export function splitOutsideBraces(text: string, separator: RegExp): string[] {
  const parts: string[] = [];
  let depth = 0;
  let partStart = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\\") index += 1;
    else if (character === "{") depth += 1;
    else if (character === "}") depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      separator.lastIndex = index;
      const match = separator.exec(text);
      if (match && match[0] !== "") {
        parts.push(text.slice(partStart, index));
        partStart = index + match[0].length;
        index = partStart - 1;
      }
    }
  }
  parts.push(text.slice(partStart));
  return parts.map((part) => part.trim()).filter((part) => part !== "");
}

function startsLowerCase(word: string): boolean {
  const firstLetter = /\p{L}/u.exec(word.replace(/^\{?\\[A-Za-z]+\s*|^\{?\\[^A-Za-z]/, ""))?.[0];
  return (
    firstLetter !== undefined &&
    firstLetter === firstLetter.toLowerCase() &&
    firstLetter !== firstLetter.toUpperCase()
  );
}

/** A name braced whole, as `{World Health Organization}`, is an organisation's, not a person's. */
function isBracedWhole(name: string): boolean {
  return name.startsWith("{") && name.endsWith("}") && splitOutsideBraces(name, /\s+/y).length === 1;
}

/**
 * BibTeX's "Last" part of a name: in `von Last, First` the words after the lower-case particles,
 * and in `First von Last` the words after the last particle, or else the last word. So
 * `van der Maaten, Laurens` and `Laurens van der Maaten` both give `Maaten`.
 */
function lastNamePart(name: string): string {
  const commaParts = splitOutsideBraces(name, /,/y);
  if (commaParts.length > 1) {
    const words = splitOutsideBraces(commaParts[0] ?? "", /\s+/y);
    const firstCapitalised = words.findIndex((word) => !startsLowerCase(word));
    return words.slice(firstCapitalised === -1 ? -1 : firstCapitalised).join(" ");
  }
  const words = splitOutsideBraces(name, /\s+/y);
  const particles = words.slice(1, -1).map((word, offset) => (startsLowerCase(word) ? offset + 1 : -1));
  const lastParticle = Math.max(-1, ...particles);
  return words.slice(lastParticle === -1 ? -1 : lastParticle + 1).join(" ");
}

function firstFamilyName(names: string | undefined): string {
  const first = splitOutsideBraces(names ?? "", /\s+and\s+/iy)[0] ?? "";
  if (first === "" || first.toLowerCase() === "others") return "";
  if (isBracedWhole(first)) {
    const words = asciiWords(first);
    return words.find((word) => !TITLE_STOPWORDS.has(word)) ?? words[0] ?? "";
  }
  return asciiWords(lastNamePart(first)).join("");
}

function firstTitleWord(title: string | undefined): string {
  const words = asciiWords(title ?? "");
  return words.find((word) => !TITLE_STOPWORDS.has(word)) ?? words[0] ?? "";
}

/** `anon` stands in for a work with no author or editor. */
export function citationKeyStem(draft: BibtexEntryDraft): string {
  const familyName = firstFamilyName(draft.fields.get("author") ?? draft.fields.get("editor"));
  const year = /\d{4}/.exec(draft.fields.get("year") ?? "")?.[0] ?? "";
  return `${familyName || "anon"}${year}${firstTitleWord(draft.fields.get("title"))}`;
}
