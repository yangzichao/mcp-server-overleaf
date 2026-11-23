/**
 * Reads the `<meta name="ol-…">` tags Overleaf's pages carry their settings in. Pug writes an
 * object as escaped JSON in `content`, a `true` boolean as a bare `content` attribute and a
 * `false` one as no `content` at all, which is how `frontend/js/utils/meta.ts` reads them back.
 */

export interface MetaTag {
  readonly content: string | undefined;
}

const HTML_ENTITIES: Record<string, string> = { quot: '"', apos: "'", lt: "<", gt: ">", amp: "&" };

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X"))
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    return HTML_ENTITIES[code.toLowerCase()] ?? entity;
  });
}

function escapeForPattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Undefined when the page has no such tag. */
export function readMetaTag(html: string, name: string): MetaTag | undefined {
  const tag = new RegExp(`<meta\\s[^>]*name=["']${escapeForPattern(name)}["'][^>]*>`, "i").exec(html)?.[0];
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
