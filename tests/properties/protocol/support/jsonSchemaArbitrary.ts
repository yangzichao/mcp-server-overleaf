import fc from "fast-check";

/** The parts of JSON Schema that the server's Zod schemas produce in `tools/list`. */
export interface JsonSchema {
  readonly type?: string;
  readonly enum?: readonly (string | number | boolean)[];
  readonly const?: string | number | boolean;
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly items?: JsonSchema;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly exclusiveMinimum?: number;
  readonly exclusiveMaximum?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly anyOf?: readonly JsonSchema[];
}

/**
 * Values worth trying for a property, by the property's name: paths that exist, revisions the
 * project has, text the files contain. A value from the pool is still kept only when the
 * schema allows it, so a pool can hold near misses without breaking the schema.
 */
export type PropertyValuePools = Readonly<Record<string, fc.Arbitrary<unknown>>>;

/** Arrays stay short: a call with many keys or queries tests nothing a call with four does not. */
const LONGEST_GENERATED_ARRAY = 4;

/** Text that trips string handling: LaTeX specials, line breaks, astral and control characters. */
const AWKWARD_TEXT = fc.oneof(
  fc.constantFrom(
    "",
    " ",
    "x",
    "\\",
    "{",
    "}",
    "%",
    "$",
    "&",
    "#",
    "~",
    "\n",
    "a\nb",
    "\r\n",
    "é",
    "北京",
    "😀",
    "\u0000",
    "‮",
    ".",
    "..",
    "/",
  ),
  fc.string({ maxLength: 12 }),
  fc.string({ unit: "grapheme", maxLength: 6 }),
);

function integerFrom(schema: JsonSchema): fc.Arbitrary<number> {
  const lowest = schema.minimum ?? (schema.exclusiveMinimum === undefined ? -3 : schema.exclusiveMinimum + 1);
  const highest =
    schema.maximum ??
    (schema.exclusiveMaximum === undefined ? Number.MAX_SAFE_INTEGER : schema.exclusiveMaximum - 1);
  return fc.oneof(
    { arbitrary: fc.integer({ min: lowest, max: Math.min(highest, lowest + 40) }), weight: 4 },
    { arbitrary: fc.constantFrom(lowest, highest), weight: 1 },
  );
}

function allowedBy(schema: JsonSchema): (value: unknown) => boolean {
  const pattern = schema.pattern === undefined ? undefined : new RegExp(schema.pattern, "u");
  return (value) =>
    typeof value === "string" &&
    value.length >= (schema.minLength ?? 0) &&
    value.length <= (schema.maxLength ?? Number.POSITIVE_INFINITY) &&
    (pattern === undefined || pattern.test(value));
}

function stringFrom(schema: JsonSchema, pool: fc.Arbitrary<unknown> | undefined): fc.Arbitrary<unknown> {
  const anyText =
    schema.pattern === undefined ? AWKWARD_TEXT : fc.stringMatching(new RegExp(schema.pattern, "u"));
  const candidates = pool
    ? fc.oneof({ arbitrary: pool, weight: 4 }, { arbitrary: anyText, weight: 1 })
    : anyText;
  return candidates.filter(allowedBy(schema));
}

/** Any value `schema` accepts, drawn from `pool` most of the time when there is one. */
function arbitraryFromSchema(
  schema: JsonSchema,
  pool: fc.Arbitrary<unknown> | undefined,
): fc.Arbitrary<unknown> {
  if (schema.anyOf) return fc.oneof(...schema.anyOf.map((option) => arbitraryFromSchema(option, pool)));
  if (schema.const !== undefined) return fc.constant(schema.const);
  if (schema.enum) return fc.constantFrom(...schema.enum);
  switch (schema.type) {
    case "string":
      return stringFrom(schema, pool);
    case "integer":
      return integerFrom(schema);
    case "boolean":
      return fc.boolean();
    case "array": {
      const minLength = schema.minItems ?? 0;
      const maxLength = Math.max(
        minLength,
        Math.min(schema.maxItems ?? LONGEST_GENERATED_ARRAY, LONGEST_GENERATED_ARRAY),
      );
      return fc.array(arbitraryFromSchema(schema.items ?? {}, pool), { minLength, maxLength });
    }
    default:
      throw new Error(`No generator for the schema ${JSON.stringify(schema)}.`);
  }
}

/** A value for every property of a tool's input, each from its schema and its pool. */
export function argumentValuesFromSchema(
  inputSchema: JsonSchema,
  pools: PropertyValuePools,
): fc.Arbitrary<Record<string, unknown>> {
  return fc.record(
    Object.fromEntries(
      Object.entries(inputSchema.properties ?? {}).map(([name, schema]) => [
        name,
        arbitraryFromSchema(schema, pools[name]),
      ]),
    ),
  );
}
