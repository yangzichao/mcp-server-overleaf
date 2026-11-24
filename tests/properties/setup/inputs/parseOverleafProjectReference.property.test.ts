import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { extractOverleafProjectId } from "../../../../src/config/projects/projectIdentity.js";
import { parseOverleafProjectReference } from "../../../../src/setup/inputs/parseOverleafProjectReference.js";
import { SetupError } from "../../../../src/setup/setupError.js";
import {
  projectAddress,
  surroundingWhitespace,
  writtenProjectId,
} from "../../config/projects/overleafProjectIds.js";

const shareLink = fc
  .tuple(fc.constantFrom("read", "1234abcd", ":edit"), fc.stringMatching(/^[A-Za-z]{8,14}$/))
  .map(([kind, token]) => `https://www.overleaf.com/${kind}/${token}`);
const anyReference = fc.oneof(
  writtenProjectId,
  projectAddress.map(({ written }) => written),
  shareLink,
  fc.string({ maxLength: 40 }),
);

describe("parseOverleafProjectReference properties", () => {
  it("gives the id the server would read from the same text, or refuses it with a SetupError", () => {
    fc.assert(
      fc.property(anyReference, surroundingWhitespace, (reference, around) => {
        const written = `${around}${reference}${around}`;
        const expected = extractOverleafProjectId(written);
        if (expected !== null) {
          expect(parseOverleafProjectReference(written)).toBe(expected);
          return;
        }
        expect(() => parseOverleafProjectReference(written)).toThrow(SetupError);
      }),
    );
  });

  it("names a share link as one, and says how to find the project address instead", () => {
    fc.assert(
      fc.property(shareLink, (link) => {
        let refusal: unknown;
        try {
          parseOverleafProjectReference(link);
        } catch (error) {
          refusal = error;
        }
        expect(refusal).toBeInstanceOf(SetupError);
        expect((refusal as SetupError).message).toContain("share link");
        expect((refusal as SetupError).remedy).toContain("/project/");
      }),
    );
  });
});
