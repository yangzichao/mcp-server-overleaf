import { describe, expect, it } from "vitest";

import {
  ImageNotReadableError,
  MAXIMUM_IMAGE_BYTES,
  prepareImageForModel,
} from "../../src/images/prepareImageForModel.js";

/** Small real files written by Pillow 11.3, one per format and flavour. */
const REAL_IMAGES = {
  "png 3x2":
    "iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAFElEQVR4nGM8wcXFAAZMEIqBgQEAEHIA4C4UN34AAAAASUVORK5CYII=",
  "jpeg progressive with EXIF 6x3":
    "/9j/4AAQSkZJRgABAQAAAQABAAD/4QASRXhpZgAASUkqAAgAAAAAAP/bAEMAEAsMDgwKEA4NDhIREBMYKBoYFhYYMSMlHSg6Mz08OTM4N0BIXE5ARFdFNzhQbVFXX2JnaGc+TXF5cGR4XGVnY//bAEMBERISGBUYLxoaL2NCOEJjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY//CABEIAAMABgMBIgACEQEDEQH/xAAVAAEBAAAAAAAAAAAAAAAAAAAABv/EABQBAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhADEAAAAZ8H/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABDz/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=",
  "gif 7x2": "R0lGODdhBwACAIAAAAAAAAAAACwAAAAABwACAAAICAABCBxIkGBAADs=",
  "webp lossy 9x8": "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoJAAgAAUAmJaQAA3AA/vzKsAA=",
  "webp lossless 10x11": "UklGRh4AAABXRUJQVlA4TBEAAAAvCYACEAfQhCY0oYCBiOh/AAA=",
  "webp extended 12x13":
    "UklGRkgAAABXRUJQVlA4WAoAAAAQAAAACwAADAAAQUxQSAoAAAABB1DAiAhERP8DVlA4IBgAAAAwAQCdASoMAA0AAUAmJaQAA3AA/vzKsAA=",
};

function bytesOf(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, "base64"));
}

/** A PNG signature and IHDR chunk claiming the given size, padded to `totalBytes`. */
function pngHeader(width: number, height: number, totalBytes = 33): Uint8Array {
  const bytes = new Uint8Array(totalBytes);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function refusal(bytes: Uint8Array | string, path: string): string {
  const content = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  try {
    prepareImageForModel(content, path);
  } catch (error) {
    expect(error).toBeInstanceOf(ImageNotReadableError);
    return (error as Error).message;
  }
  throw new Error(`${path} was accepted`);
}

describe("prepareImageForModel", () => {
  for (const [name, mimeType, width, height] of [
    ["png 3x2", "image/png", 3, 2],
    ["jpeg progressive with EXIF 6x3", "image/jpeg", 6, 3],
    ["gif 7x2", "image/gif", 7, 2],
    ["webp lossy 9x8", "image/webp", 9, 8],
    ["webp lossless 10x11", "image/webp", 10, 11],
    ["webp extended 12x13", "image/webp", 12, 13],
  ] as const) {
    it(`reads a real ${name} file`, () => {
      const base64 = REAL_IMAGES[name];
      const bytes = bytesOf(base64);
      expect(prepareImageForModel(bytes, "figures/figure")).toEqual({
        mimeType,
        base64,
        width,
        height,
        byteLength: bytes.length,
      });
    });
  }

  it("goes by the file's bytes, not its name", () => {
    expect(prepareImageForModel(bytesOf(REAL_IMAGES["png 3x2"]), "photo.jpg").mimeType).toBe("image/png");
  });

  it("explains that PDF, EPS and SVG figures must be rendered first", () => {
    expect(refusal("%PDF-1.5\n%âã\n1 0 obj", "figures/plot.pdf")).toMatch(/is a PDF.*pdftoppm/);
    expect(refusal("%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 10 10", "plot.eps")).toMatch(/PostScript/);
    expect(refusal(new Uint8Array([0xc5, 0xd0, 0xd3, 0xc6, 0, 0, 0, 0]), "binary-header")).toMatch(
      /PostScript/,
    );
    expect(refusal('\uFEFF<?xml version="1.0"?>\n<!-- drawn -->\n<svg xmlns="x">', "diagram")).toMatch(
      /is an SVG drawing.*rsvg-convert/,
    );
    expect(refusal("plain text", "notes.svg")).toMatch(/SVG/);
  });

  it("asks for a PNG when the format is one the model cannot see", () => {
    expect(refusal(new Uint8Array([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0]), "scan.tiff")).toBe(
      "scan.tiff is not a PNG, JPEG, GIF or WebP image, the formats the model can see. Convert it to PNG first.",
    );
  });

  it("says when a file starts like an image but its size cannot be read", () => {
    expect(refusal(pngHeader(0, 0).subarray(0, 8), "cut.png")).toMatch(/starts like a PNG image/);
    expect(refusal(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), "empty.jpg")).toMatch(/damaged/);
  });

  it("refuses an image over the byte or pixel limit, and accepts one exactly at them", () => {
    expect(refusal(pngHeader(10, 10, MAXIMUM_IMAGE_BYTES + 1), "huge.png")).toMatch(
      `is ${MAXIMUM_IMAGE_BYTES + 1} bytes, more than the ${MAXIMUM_IMAGE_BYTES}`,
    );
    expect(prepareImageForModel(pngHeader(10, 10, MAXIMUM_IMAGE_BYTES), "limit.png").base64).toHaveLength(
      5_000_000,
    );
    expect(refusal(pngHeader(8001, 20), "wide.png")).toMatch(
      /8001 by 20 pixels; the model accepts at most 8000/,
    );
    expect(prepareImageForModel(pngHeader(8000, 8000), "square.png").width).toBe(8000);
  });
});
