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

function escapeForPattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A tag ends at the next `<` or `>`, so one left open does not run into the next. */
const META_TAG = /<meta\s[^<>]*>/gi;

/**
 * The tag is found first and its name checked after: one pattern for both backtracks
 * quadratically on a tag that repeats `name="…"` and never closes.
 */
function findMetaTag(html: string, name: string): string | undefined {
  const namedAs = new RegExp(`name=["']${escapeForPattern(name)}["']`, "i");
  for (const [tag] of html.matchAll(META_TAG)) {
    if (namedAs.test(tag.slice("<meta ".length))) return tag;
  }
  return undefined;
}

/** Undefined when the page has no such tag. */
export function readMetaTag(html: string, name: string): MetaTag | undefined {
  const tag = findMetaTag(html, name);
  if (!tag) return undefined;
  const quoted = /\scontent=(?:"([^"]*)"|'([^']*)')/i.exec(tag);
  if (quoted) return { content: decodeHtmlEntities(quoted[1] ?? quoted[2] ?? "") };
  return { content: /\scontent(?=[\s/>])/i.test(tag) ? "" : undefined };
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
