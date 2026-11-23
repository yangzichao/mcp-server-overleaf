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

const MARKUP_PATTERN = /<(?:\w+:)?(i|italic|em|b|bold|strong|sub|sup|sc)\b[^<>]*>([^<]*)<\/(?:\w+:)?\1>/gi;
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

/**
 * `&`, `%` and `#` start alignment, comments and parameters in LaTeX; one already escaped is
 * left. Escaped means after an odd run of backslashes: after `\\`, a line break, it is not.
 */
function escapeLatexSpecials(text: string): string {
  return text.replace(/(?<!\\)(\\*)([&%#])/g, (whole, backslashes: string, special: string) =>
    backslashes.length % 2 === 1 ? whole : `${backslashes}\\${special}`,
  );
}

/** True when the braces nest, counting every one or, with `skippingEscaped`, none after a backslash. */
function bracesNest(text: string, skippingEscaped: boolean): boolean {
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\\" && skippingEscaped) index += 1;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth < 0) return false;
  }
  return depth === 0;
}

/** A brace in a value; an escaped one, as `\{`, starts at its backslash. */
interface BraceToken {
  readonly start: number;
  readonly escaped: boolean;
  readonly opens: boolean;
}

function findBraceTokens(text: string): BraceToken[] {
  const tokens: BraceToken[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\\") {
      const next = text[index + 1];
      if (next === "{" || next === "}") tokens.push({ start: index, escaped: true, opens: next === "{" });
      index += 1;
    } else if (character === "{" || character === "}") {
      tokens.push({ start: index, escaped: false, opens: character === "{" });
    }
  }
  return tokens;
}

/**
 * BibTeX counts every brace in a value, `\{` and `\}` included, while the .bib readers here
 * skip a brace after a backslash, and a value must end at the same brace for both. When its
 * braces do not nest both ways, a brace that does not pair with one of its own kind is
 * dropped, with the backslash of an escaped one. Every pair is kept, so a `\textit{}` made
 * from markup keeps its argument.
 */
export function balanceBraces(text: string): string {
  if (bracesNest(text, false) && bracesNest(text, true)) return text;
  const tokens = findBraceTokens(text);
  const waiting: BraceToken[] = [];
  const unpaired = new Set<BraceToken>();
  for (const token of tokens) {
    if (token.opens) waiting.push(token);
    else if (waiting.at(-1)?.escaped === token.escaped) waiting.pop();
    else unpaired.add(token);
  }
  for (const token of waiting) unpaired.add(token);
  let kept = "";
  let cursor = 0;
  for (const token of tokens) {
    if (!unpaired.has(token)) continue;
    kept += text.slice(cursor, token.start);
    cursor = token.start + (token.escaped ? 2 : 1);
  }
  return kept + text.slice(cursor);
}

/** True when the text ends in an odd run of backslashes, the last of which escapes nothing. */
function endsInLoneBackslash(text: string): boolean {
  let backslashes = 0;
  while (text[text.length - 1 - backslashes] === "\\") backslashes += 1;
  return backslashes % 2 === 1;
}

/**
 * A backslash at the end of a value would escape, for the .bib readers here, the brace that
 * closes it, so it is dropped. BibTeX ends the value there, but the period a style writes
 * after it would make `\.`, an accent.
 */
export function dropLoneBackslashAtEnd(text: string): string {
  let kept = text;
  while (endsInLoneBackslash(kept)) kept = kept.slice(0, -1).trimEnd();
  return kept;
}

/** Everything a free-text field needs: entities decoded, markup converted, specials escaped, one line. */
export function cleanFieldText(text: string): string {
  return dropLoneBackslashAtEnd(
    balanceBraces(escapeLatexSpecials(markupToLatex(decodeHtmlEntities(text))))
      .replace(/\s+/g, " ")
      .trim(),
  );
}

/**
 * Page ranges with BibTeX's double hyphen, whatever dash the source used. Spaces before a dash
 * are matched only from the start of their run, so a long run with no dash after it is read
 * once rather than once from each of its characters.
 */
export function normalizePages(pages: string): string {
  return pages.replace(/(?:(?<!\s)\s+)?(?:-{1,3}|[\u2010-\u2015\u2212])\s*/g, "--").trim();
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
