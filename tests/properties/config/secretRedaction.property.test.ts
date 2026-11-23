import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { redactSecrets } from "../../../src/config/secretRedaction.js";

const MARKER = "***REDACTED***";

/**
 * No `*` and no upper case, so a secret cannot overlap the marker; one that did would be put
 * back by the very marker that replaces it.
 */
const secret = fc.string({
  unit: fc.constantFrom("a", "b", "c", "x", "y", "1", "/", "=", "北", "😀"),
  minLength: 1,
  maxLength: 8,
});
const secrets = fc.array(secret, { maxLength: 4 });

/** Text that is often built around the secrets, so occurrences, adjacency and overlap are common. */
const textAround = (candidates: readonly string[]) =>
  fc
    .array(fc.oneof(fc.constantFrom(...candidates, "a", "b", " ", "https://"), fc.string({ maxLength: 3 })), {
      maxLength: 10,
    })
    .map((pieces) => pieces.join(""))
    .filter((text) => !text.includes("*"));

const secretsAndText = secrets.chain((candidates) =>
  fc.tuple(fc.constant(candidates), textAround(candidates)),
);

function longEnough(candidates: readonly string[]): string[] {
  return candidates.filter((candidate) => candidate.length >= 4);
}

function visibleText(redacted: string): string {
  return redacted.split(MARKER).join("");
}

/** The original text with every character that lies inside any occurrence of a secret removed. */
function textOutsideEverySecret(text: string, candidates: readonly string[]): string {
  const covered = new Array<boolean>(text.length).fill(false);
  for (const candidate of longEnough(candidates)) {
    for (let start = text.indexOf(candidate); start !== -1; start = text.indexOf(candidate, start + 1)) {
      covered.fill(true, start, start + candidate.length);
    }
  }
  return text
    .split("")
    .filter((_, index) => !covered[index])
    .join("");
}

describe("redactSecrets properties", () => {
  it("leaves no secret of four or more characters anywhere in the output", () => {
    fc.assert(
      fc.property(secretsAndText, ([candidates, text]) => {
        const redacted = redactSecrets(text, candidates);
        for (const candidate of longEnough(candidates)) expect(redacted).not.toContain(candidate);
      }),
    );
  });

  it("leaves text that holds none of the secrets unchanged", () => {
    fc.assert(
      fc.property(secretsAndText, ([candidates, text]) => {
        fc.pre(longEnough(candidates).every((candidate) => !text.includes(candidate)));
        expect(redactSecrets(text, candidates)).toBe(text);
      }),
    );
  });

  it("ignores secrets shorter than four characters", () => {
    fc.assert(
      fc.property(secretsAndText, ([candidates, text]) => {
        fc.pre(candidates.every((candidate) => candidate.length < 4));
        expect(redactSecrets(text, candidates)).toBe(text);
      }),
    );
  });

  it("is idempotent", () => {
    fc.assert(
      fc.property(secretsAndText, ([candidates, text]) => {
        const once = redactSecrets(text, candidates);
        expect(redactSecrets(once, candidates)).toBe(once);
      }),
    );
  });

  // Found by this property: secrets ["abcd", "bcdefgh"] in "abcdefgh" once gave
  // "***REDACTED***efgh", because redacting the first broke up the second.
  it("hides every character that belongs to an occurrence of any secret", () => {
    fc.assert(
      fc.property(secretsAndText, ([candidates, text]) => {
        expect(visibleText(redactSecrets(text, candidates))).toBe(textOutsideEverySecret(text, candidates));
      }),
    );
  });
});
