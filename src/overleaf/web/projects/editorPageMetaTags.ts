/**
 * Reads the `<meta name="ol-…">` tags Overleaf's pages carry their settings in. Pug writes an
 * object as escaped JSON in `content`, a `true` boolean as a bare `content` attribute and a
 * `false` one as no `content` at all, which is how `frontend/js/utils/meta.ts` reads them back.
 */

export interface MetaTag {
  readonly content: string | undefined;
}

const HTML_ENTITIES: Record<string, string> = { quot: '"', apos: "'", lt: "<", gt: ">", amp: "&" };

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

const META_TAG = /<meta\s[^<>]*>/gi;

const ATTRIBUTE =
  /\s+(?<name>[^\s"'<>/=]+)(?:\s*=\s*(?:"(?<doubleQuoted>[^"]*)"|'(?<singleQuoted>[^']*)'|(?<unquoted>[^\s"'<>=`]+)))?/y;

/**
 * The tag's attributes, read one after another, so a quoted value is never taken for an
 * attribute: Pug leaves `'` unescaped, so a value can hold `name='ol-…'`.
 */
function readAttributes(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const attribute = new RegExp(ATTRIBUTE);
  attribute.lastIndex = "<meta".length;
  for (let match = attribute.exec(tag); match !== null; match = attribute.exec(tag)) {
    const { name = "", doubleQuoted, singleQuoted, unquoted } = match.groups ?? {};
    const lowerCaseName = name.toLowerCase();
    if (!attributes.has(lowerCaseName)) {
      attributes.set(lowerCaseName, doubleQuoted ?? singleQuoted ?? unquoted ?? "");
    }
  }
  return attributes;
}

export function readMetaTag(html: string, name: string): MetaTag | undefined {
  const wanted = name.toLowerCase();
  for (const [tag] of html.matchAll(META_TAG)) {
    const attributes = readAttributes(tag);
    if (attributes.get("name")?.toLowerCase() !== wanted) continue;
    const content = attributes.get("content");
    return { content: content === undefined ? undefined : decodeHtmlEntities(content) };
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
