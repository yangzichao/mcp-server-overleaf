import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  ImageNotReadableError,
  MAXIMUM_IMAGE_BYTES,
  MAXIMUM_IMAGE_SIDE_PIXELS,
  prepareImageForModel,
  suggestImageConversion,
} from "../../../src/images/prepareImageForModel.js";
import { generatedImage, IMAGE_SIGNATURES } from "./generatedImageFiles.js";

const imagePath = fc.constantFrom("figures/plot.png", "a.jpg", "photo.JPEG", "x.webp", "noextension");

/** A GIF of the given size, padded with zeros to `byteLength`. */
function gifOf(width: number, height: number, byteLength = 16): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  bytes.set([...Buffer.from("GIF89a"), width & 0xff, width >> 8, height & 0xff, height >> 8]);
  return bytes;
}

function outcomeOf(bytes: Uint8Array, path: string): "accepted" | "refused" {
  try {
    prepareImageForModel(bytes, path);
    return "accepted";
  } catch (error) {
    expect(error).toBeInstanceOf(ImageNotReadableError);
    return "refused";
  }
}

/** The prolog XML allows before the root element: a declaration, then comments, processing instructions and a doctype. */
const misc = fc.constantFrom(
  "\n",
  "  ",
  "<!-- Created with Inkscape (http://www.inkscape.org/) -->",
  "<!-- a > b -->",
  "<!---->",
  '<?xml-stylesheet href="style.css" type="text/css"?>',
);
const xmlProlog = fc
  .record({
    byteOrderMark: fc.constantFrom("", "﻿"),
    declaration: fc.constantFrom("", '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n'),
    beforeDoctype: fc.array(misc, { maxLength: 2 }),
    doctype: fc.constantFrom(
      "",
      "<!DOCTYPE svg>",
      '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">',
      '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "svg11.dtd" [\n\t<!ENTITY ns_extend "http://ns.adobe.com/Extensibility/1.0/">\n]>',
    ),
    afterDoctype: fc.array(misc, { maxLength: 2 }),
  })
  .map(
    ({ byteOrderMark, declaration, beforeDoctype, doctype, afterDoctype }) =>
      `${byteOrderMark}${declaration}${beforeDoctype.join("")}${doctype}\n${afterDoctype.join("")}`,
  );

describe("prepareImageForModel properties", () => {
  it("sends every generated image within the limits as base64 of its exact bytes", () => {
    fc.assert(
      fc.property(generatedImage, fc.nat({ max: 8 }), imagePath, ({ header, bytes }, offset, path) => {
        fc.pre(header.width <= MAXIMUM_IMAGE_SIDE_PIXELS && header.height <= MAXIMUM_IMAGE_SIDE_PIXELS);
        // A view into a larger buffer, as a file read may return.
        const buffer = new Uint8Array(offset + bytes.length + 3);
        buffer.set(bytes, offset);
        const view = buffer.subarray(offset, offset + bytes.length);
        const image = prepareImageForModel(view, path);
        expect(image).toMatchObject({ ...header, byteLength: bytes.length });
        expect(new Uint8Array(Buffer.from(image.base64, "base64"))).toEqual(bytes);
      }),
    );
  });

  it("refuses any other bytes with ImageNotReadableError and nothing else", () => {
    const anyBytes = fc.oneof(
      fc.uint8Array({ maxLength: 64 }),
      fc
        .tuple(fc.constantFrom(...IMAGE_SIGNATURES), fc.uint8Array({ maxLength: 64 }))
        .map(([signature, rest]) => new Uint8Array([...signature, ...rest])),
      fc.string({ maxLength: 40 }).map((text) => new TextEncoder().encode(text)),
    );
    fc.assert(
      fc.property(anyBytes, imagePath, (bytes, path) => {
        outcomeOf(bytes, path);
      }),
    );
  });

  it("accepts an image exactly at the byte and pixel limits and refuses one past them", () => {
    const limitCase = fc.constantFrom(
      { bytes: gifOf(1, 1, MAXIMUM_IMAGE_BYTES), outcome: "accepted" },
      { bytes: gifOf(1, 1, MAXIMUM_IMAGE_BYTES + 1), outcome: "refused" },
      { bytes: gifOf(MAXIMUM_IMAGE_SIDE_PIXELS, MAXIMUM_IMAGE_SIDE_PIXELS), outcome: "accepted" },
      { bytes: gifOf(MAXIMUM_IMAGE_SIDE_PIXELS + 1, 1), outcome: "refused" },
      { bytes: gifOf(1, MAXIMUM_IMAGE_SIDE_PIXELS + 1), outcome: "refused" },
    );
    fc.assert(
      fc.property(limitCase, imagePath, ({ bytes, outcome }, path) => {
        expect(outcomeOf(bytes, path)).toBe(outcome);
      }),
      { numRuns: 20 },
    );
  });

  // Found by this property: "<!DOCTYPE svg>\n<!-- Created with Inkscape … -->" before "<svg>" was
  // once not told as SVG, because comments were skipped only before the doctype.
  it("tells an SVG drawing by its first bytes, after any prolog XML allows", () => {
    const root = fc.constantFrom(
      "<svg>",
      '<svg xmlns="http://www.w3.org/2000/svg">',
      '<svg\n  width="1">',
      "<SVG ",
    );
    fc.assert(
      fc.property(xmlProlog, root, (prolog, svg) => {
        fc.pre(new TextEncoder().encode(prolog + svg).length <= 512);
        const suggestion = suggestImageConversion(
          new TextEncoder().encode(`${prolog}${svg}</svg>`),
          "plot.png",
        );
        expect(suggestion).toContain("is an SVG drawing");
      }),
    );
  });

  it("tells no SVG drawing in XML whose root element is another", () => {
    const root = fc.constantFrom("<svgz>", "<html>", "<math>", "<svg:svg>", "text");
    fc.assert(
      fc.property(xmlProlog, root, (prolog, other) => {
        expect(
          suggestImageConversion(new TextEncoder().encode(`${prolog}${other}`), "plot.png"),
        ).toBeUndefined();
      }),
    );
  });
});
