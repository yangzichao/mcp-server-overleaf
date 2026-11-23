/**
 * Turns metadata text from doi.org, Crossref and arXiv into BibTeX field values that compile:
 * markup becomes LaTeX, characters LaTeX treats as commands are escaped, and braces balance.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
};

function codePointText(code: number, whole: string): string {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
}

/** Crossref titles carry their markup entity-encoded, as `&lt;italic&gt;E. coli&lt;/italic&gt;`. */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (/^#x/i.test(name)) return codePointText(Number.parseInt(name.slice(2), 16), whole);
    if (name.startsWith("#")) return codePointText(Number(name.slice(1)), whole);
    return NAMED_ENTITIES[name.toLowerCase()] ?? whole;
  });
}

const MARKUP_COMMANDS: Record<string, string> = {
  i: "textit",
  italic: "textit",
  em: "textit",
  b: "textbf",
  bold: "textbf",
  strong: "textbf",
  sub: "textsubscript",
  sup: "textsuperscript",
  sc: "textsc",
};

const MARKUP_PATTERN = /<(?:\w+:)?(i|italic|em|b|bold|strong|sub|sup|sc)\b[^>]*>([^<]*)<\/(?:\w+:)?\1>/gi;
const TAG_PATTERN = /<\/?[A-Za-z][\w:.-]*(?:\s[^<>]*)?\/?>/g;

/** Removing a tag can join the text on either side into a new one, so remove until none is left. */
function removeTags(text: string): string {
  let previous: string;
  let current = text;
  do {
    previous = current;
    current = current.replace(TAG_PATTERN, "");
  } while (current !== previous);
  return current;
}

/** JATS and HTML emphasis to LaTeX, innermost first; any other tag (MathML and so on) is dropped. */
export function markupToLatex(text: string): string {
  let current = text;
  for (let pass = 0; pass < 8; pass += 1) {
    const next = current.replace(
      MARKUP_PATTERN,
      (_, tag: string, inner: string) => `\\${MARKUP_COMMANDS[tag.toLowerCase()]}{${inner}}`,
    );
    if (next === current) break;
    current = next;
  }
  return removeTags(current);
}

/** `&`, `%` and `#` start alignment, comments and parameters in LaTeX; one already escaped is left. */
export function escapeLatexSpecials(text: string): string {
  return text.replace(/(?<!\\)([&%#])/g, "\\$1");
}

/** BibTeX rejects a value whose braces do not balance; such a value loses its braces instead. */
export function balanceBraces(text: string): string {
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\\") index += 1;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth < 0) break;
  }
  return depth === 0 ? text : text.replace(/(?<!\\)[{}]/g, "");
}

/** Everything a free-text field needs: entities decoded, markup converted, specials escaped, one line. */
export function cleanFieldText(text: string): string {
  return balanceBraces(escapeLatexSpecials(markupToLatex(decodeHtmlEntities(text))))
    .replace(/\s+/g, " ")
    .trim();
}

/** Page ranges with BibTeX's double hyphen, whatever dash the source used. */
export function normalizePages(pages: string): string {
  return pages.replace(/\s*(?:-{1,3}|[\u2010-\u2015\u2212])\s*/g, "--").trim();
}

const MONTH_MACROS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** The standard month macro for `May`, `may`, `{May}`, `5` or `05`; undefined for anything else. */
export function toMonthMacro(month: string): string | undefined {
  const written = month.replace(/[{}]/g, "").trim().toLowerCase();
  const number = Number(written);
  if (Number.isInteger(number) && number >= 1 && number <= 12) return MONTH_MACROS[number - 1];
  return MONTH_MACROS.find((macro) => written === macro || (written.length > 3 && written.startsWith(macro)));
}

export function isMonthMacro(value: string): boolean {
  return MONTH_MACROS.includes(value);
}
