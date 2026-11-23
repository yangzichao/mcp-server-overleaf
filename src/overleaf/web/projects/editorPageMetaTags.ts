/**
 * Reads the `<meta name="ol-…">` tags Overleaf's pages carry their settings in. Pug writes an
 * object as escaped JSON in `content`, a `true` boolean as a bare `content` attribute and a
 * `false` one as no `content` at all, which is how `frontend/js/utils/meta.ts` reads them back.
 */

export interface MetaTag {
  readonly content: string | undefined;
}

const HTML_ENTITIES: Record<string, string> = { quot: '"', apos: "'", lt: "<", gt: ">", amp: "&" };

/** A reference past U+10FFFF names no character, so it stays as written rather than throw. */
function codePointText(code: number, entity: string): string {
  return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
}

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      return codePointText(Number.parseInt(code.slice(2), 16), entity);
    }
    if (code.startsWith("#")) return codePointText(Number.parseInt(code.slice(1), 10), entity);
    return HTML_ENTITIES[code.toLowerCase()] ?? entity;
  });
}

/** A tag ends at the next `<` or `>`, so one left open does not run into the next. */
const META_TAG = /<meta\s[^<>]*>/gi;

/** An attribute's name, then a value in double quotes, in single quotes, bare, or none. */
const ATTRIBUTE = /\s+([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>=`]+)))?/y;

/**
 * The tag's attributes, read one after another, so a quoted value is never taken for an
 * attribute: Pug leaves `'` unescaped, so a value can hold `name='ol-…'`.
 * A bare attribute, as a true boolean's `content`, is there with an undefined value.
 */
function readAttributes(tag: string): Map<string, string | undefined> {
  const attributes = new Map<string, string | undefined>();
  const attribute = new RegExp(ATTRIBUTE);
  attribute.lastIndex = "<meta".length;
  for (let match = attribute.exec(tag); match !== null; match = attribute.exec(tag)) {
    const name = (match[1] ?? "").toLowerCase();
    if (!attributes.has(name)) attributes.set(name, match[2] ?? match[3] ?? match[4]);
  }
  return attributes;
}

/**
 * Undefined when the page has no such tag. Each tag is found first and its attributes read
 * after: one pattern for both backtracks quadratically on a tag that repeats `name="…"` and
 * never closes.
 */
export function readMetaTag(html: string, name: string): MetaTag | undefined {
  const wanted = name.toLowerCase();
  for (const [tag] of html.matchAll(META_TAG)) {
    const attributes = readAttributes(tag);
    if (attributes.get("name")?.toLowerCase() !== wanted) continue;
    const content = attributes.get("content");
    if (content !== undefined) return { content: decodeHtmlEntities(content) };
    return { content: attributes.has("content") ? "" : undefined };
  }
  return undefined;
}

export function readJsonMetaTag(html: string, name: string): unknown {
  const content = readMetaTag(html, name)?.content;
  if (!content) return undefined;
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

export function readBooleanMetaTag(html: string, name: string): boolean | undefined {
  const tag = readMetaTag(html, name);
  return tag === undefined ? undefined : tag.content !== undefined;
}
