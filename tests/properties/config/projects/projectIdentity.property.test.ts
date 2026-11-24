import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  extractOverleafProjectId,
  looksLikeOverleafProjectId,
} from "../../../../src/config/projects/projectIdentity.js";
import { projectAddress, surroundingWhitespace, writtenProjectId } from "./overleafProjectIds.js";

const anyReference = fc.oneof(
  fc.string({ maxLength: 40 }),
  fc.stringMatching(/^[0-9a-gA-G]{22,26}$/),
  projectAddress.map(({ written }) => written),
  fc.constantFrom(
    "/project/",
    "https://www.overleaf.com/read/abcdefghijkl",
    "project/0123456789abcdef01234567",
  ),
);

describe("Overleaf project identity properties", () => {
  it("takes a bare id with any surrounding white space, in lower case", () => {
    fc.assert(
      fc.property(
        writtenProjectId,
        surroundingWhitespace,
        surroundingWhitespace,
        (projectId, before, after) => {
          const written = `${before}${projectId}${after}`;
          expect(looksLikeOverleafProjectId(written)).toBe(true);
          expect(extractOverleafProjectId(written)).toBe(projectId.toLowerCase());
        },
      ),
    );
  });

  it("takes the id out of a project address, in lower case", () => {
    fc.assert(
      fc.property(projectAddress, surroundingWhitespace, ({ projectId, written }, around) => {
        expect(extractOverleafProjectId(`${around}${written}${around}`)).toBe(projectId.toLowerCase());
      }),
    );
  });

  it("returns null or 24 lower-case hexadecimal characters for any text", () => {
    fc.assert(
      fc.property(anyReference, (reference) => {
        const projectId = extractOverleafProjectId(reference);
        if (projectId !== null) expect(projectId).toMatch(/^[0-9a-f]{24}$/);
      }),
    );
  });

  it("says text looks like an id exactly when the trimmed text is one, and then extracts that text", () => {
    fc.assert(
      fc.property(anyReference, (reference) => {
        const looksLikeAnId = looksLikeOverleafProjectId(reference);
        expect(looksLikeAnId).toBe(/^[0-9a-f]{24}$/i.test(reference.trim()));
        if (looksLikeAnId) expect(extractOverleafProjectId(reference)).toBe(reference.trim().toLowerCase());
      }),
    );
  });
});
