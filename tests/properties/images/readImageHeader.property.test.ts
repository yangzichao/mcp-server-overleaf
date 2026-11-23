import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { detectRasterImage } from "../../../src/images/readImageHeader.js";
import { generatedImage, IMAGE_SIGNATURES } from "./generatedImageFiles.js";

const anyBytes = fc.oneof(
  fc.uint8Array({ maxLength: 64 }),
  fc
    .tuple(fc.constantFrom(...IMAGE_SIGNATURES), fc.uint8Array({ maxLength: 64 }))
    .map(([signature, rest]) => new Uint8Array([...signature, ...rest])),
);

describe("detectRasterImage properties", () => {
  it("reads the format and size of every generated image", () => {
    fc.assert(
      fc.property(generatedImage, ({ header, bytes }) => {
        expect(detectRasterImage(bytes)).toEqual({ kind: "image", header });
      }),
    );
  });

  it("reads a cut-short image as the whole header, as damaged, or as some other file", () => {
    fc.assert(
      fc.property(generatedImage, fc.nat(), ({ header, bytes }, cut) => {
        const detection = detectRasterImage(bytes.subarray(0, cut % (bytes.length + 1)));
        expect([
          { kind: "image", header },
          { kind: "damaged", mimeType: header.mimeType },
          { kind: "other" },
        ]).toContainEqual(detection);
      }),
    );
  });

  it("never throws, and never reports a size of zero", () => {
    fc.assert(
      fc.property(anyBytes, (bytes) => {
        const detection = detectRasterImage(bytes);
        if (detection.kind === "image") {
          expect(detection.header.width).toBeGreaterThan(0);
          expect(detection.header.height).toBeGreaterThan(0);
        }
      }),
    );
  });
});
