import fc from "fast-check";

/**
 * Editor pages as Overleaf's `views/project/editor/_meta.pug` renders them: each setting a
 * `<meta name="ol-…">` tag whose value Pug escapes, `&`, `<`, `>` and `"` but not `'`, with an
 * object as JSON, a true boolean as a bare `content` and a false one as none.
 */

export type MetaValue =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "json"; readonly value: unknown }
  | { readonly kind: "boolean"; readonly value: boolean };

export interface GeneratedMetaTag {
  readonly name: string;
  readonly value: MetaValue;
}

const TEXT_PIECES = [
  "Français",
  " ",
  "&",
  "<",
  ">",
  '"',
  "'",
  "name='ol-b'",
  'name="ol-c"',
  " content='x'",
  "&#x110000;",
  "&amp;",
  "论文",
  "𝔸",
  "/",
  "=",
];

const text = fc.array(fc.constantFrom(...TEXT_PIECES), { maxLength: 6 }).map((pieces) => pieces.join(""));

const jsonValue = fc.oneof(
  fc.array(fc.record({ code: text, name: text })),
  fc.array(fc.record({ imageName: text, imageDesc: text, allowed: fc.boolean() })),
  fc.record({ first_name: text, email: text }),
);

const metaValue: fc.Arbitrary<MetaValue> = fc.oneof(
  text.map((written) => ({ kind: "text" as const, text: written })),
  jsonValue.map((value) => ({ kind: "json" as const, value })),
  fc.boolean().map((value) => ({ kind: "boolean" as const, value })),
);

export const metaTags: fc.Arbitrary<GeneratedMetaTag[]> = fc.uniqueArray(
  fc.record({
    name: fc.constantFrom("ol-a", "ol-b", "ol-c", "ol-languages", "ol-imageNames"),
    value: metaValue,
  }),
  { selector: (tag) => tag.name, maxLength: 5 },
);

export function escapeAsPug(written: string): string {
  return written.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderMetaTag({ name, value }: GeneratedMetaTag): string {
  if (value.kind === "boolean") {
    return `<meta name="${name}" data-type="boolean"${value.value ? " content" : ""}>`;
  }
  const content = value.kind === "json" ? JSON.stringify(value.value) : value.text;
  const dataType = value.kind === "json" ? ' data-type="json"' : "";
  return `<meta name="${name}"${dataType} content="${escapeAsPug(content)}">`;
}

const OTHER_MARKUP = [
  "<title>Overleaf</title>",
  '<link rel="icon" href="/favicon.svg">',
  "\n",
  "<script>var x = 1 < 2;</script>",
];

export const editorPage = fc
  .tuple(metaTags, fc.array(fc.constantFrom(...OTHER_MARKUP), { maxLength: 4 }), fc.nat())
  .map(([tags, others, seed]) => {
    const parts = [...tags.map(renderMetaTag)];
    for (const [index, other] of others.entries()) {
      parts.splice((seed + index) % (parts.length + 1), 0, other);
    }
    return { tags, page: `<head>${parts.join("")}</head>` };
  });
