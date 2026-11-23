import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { scanSource } from "../../../../src/latex/source/scannedSource.js";
import {
  describeLineForPosition,
  readDocumentRanges,
} from "../../../../src/overleaf/realtime/trackedChangeRanges.js";
import { latexLine } from "../../support/latexArbitraries.js";

function eitherExpectedOr<T>(expected: fc.Arbitrary<T>): fc.Arbitrary<unknown> {
  return fc.oneof({ weight: 3, arbitrary: expected }, { weight: 1, arbitrary: fc.jsonValue() });
}

const anyJsonNumber = fc.double({ noNaN: true, noDefaultInfinity: true });
const DATE_RANGE_MILLISECONDS = 8.64e15;
const datableNumber = fc.integer({ min: -DATE_RANGE_MILLISECONDS, max: DATE_RANGE_MILLISECONDS });
const timestampText = fc.oneof(
  fc.string(),
  fc.date({ noInvalidDate: true }).map((date) => date.toISOString()),
);

function rangesPayload(timestamp: fc.Arbitrary<unknown>): fc.Arbitrary<unknown> {
  const change = fc.record(
    {
      id: eitherExpectedOr(fc.string({ minLength: 1 })),
      op: eitherExpectedOr(
        fc.record(
          {
            p: eitherExpectedOr(fc.nat()),
            i: eitherExpectedOr(fc.string()),
            d: eitherExpectedOr(fc.string()),
          },
          { requiredKeys: ["p"] },
        ),
      ),
      metadata: eitherExpectedOr(
        fc.record({ user_id: eitherExpectedOr(fc.string()), ts: timestamp }, { requiredKeys: [] }),
      ),
    },
    { requiredKeys: [] },
  );
  const comment = fc.record(
    {
      id: eitherExpectedOr(fc.string()),
      op: eitherExpectedOr(
        fc.record(
          {
            c: eitherExpectedOr(fc.string()),
            p: eitherExpectedOr(fc.nat()),
            t: eitherExpectedOr(fc.string()),
          },
          { requiredKeys: [] },
        ),
      ),
    },
    { requiredKeys: [] },
  );
  return fc.oneof(
    fc.jsonValue(),
    fc.record(
      {
        changes: eitherExpectedOr(fc.array(eitherExpectedOr(change), { maxLength: 4 })),
        comments: eitherExpectedOr(fc.array(eitherExpectedOr(comment), { maxLength: 4 })),
      },
      { requiredKeys: [] },
    ),
  );
}

describe("readDocumentRanges properties", () => {
  it("never throws on a payload whose timestamps fit in a Date, and returns both lists sorted by position", () => {
    fc.assert(
      fc.property(rangesPayload(fc.oneof(datableNumber, timestampText)), (payload) => {
        const { changes, comments } = readDocumentRanges(payload);
        for (const list of [changes, comments]) {
          for (let index = 1; index < list.length; index += 1) {
            expect(list[index]!.position).toBeGreaterThanOrEqual(list[index - 1]!.position);
          }
        }
      }),
    );
  });

  it("keeps every well-formed change, with its text and kind", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1 }),
            p: fc.nat(),
            text: fc.string(),
            inserted: fc.boolean(),
          }),
          { maxLength: 6 },
        ),
        (written) => {
          const payload = {
            changes: written.map(({ id, p, text, inserted }) => ({
              id,
              op: inserted ? { p, i: text } : { p, d: text },
            })),
          };
          const read = readDocumentRanges(payload).changes;
          const byPosition = [...written].sort((left, right) => left.p - right.p);
          expect(read.map((change) => [change.changeId, change.kind, change.text, change.position])).toEqual(
            byPosition.map(({ id, p, text, inserted }) => [id, inserted ? "insertion" : "deletion", text, p]),
          );
        },
      ),
    );
  });

  it("never throws on any JSON payload, including a timestamp outside the Date range", () => {
    fc.assert(
      fc.property(rangesPayload(fc.oneof(anyJsonNumber, timestampText)), (payload) => {
        readDocumentRanges(payload);
      }),
    );
  });
});

describe("describeLineForPosition properties", () => {
  it("gives the line the same offset falls on in the joined text, and the last line past the end", () => {
    fc.assert(
      fc.property(
        fc
          .array(latexLine, { minLength: 1, maxLength: 10 })
          .chain((lines) => fc.tuple(fc.constant(lines), fc.nat(lines.join("\n").length + 5))),
        ([lines, position]) => {
          const text = lines.join("\n");
          const expected = position <= text.length ? scanSource("doc", text).lineAt(position) : lines.length;
          expect(describeLineForPosition(lines, position)).toBe(expected);
        },
      ),
    );
  });
});
