import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

// @ts-expect-error - build tooling is plain JavaScript, deliberately outside the TypeScript program.
import { renderBundleIcon } from "../../scripts/mcpb/renderBundleIcon.mjs";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Reads the raw scanlines back out. Every row is written with filter type "none". */
function decodePixels(icon: Buffer): Buffer {
  const start = icon.indexOf("IDAT", 0, "latin1");
  const length = icon.readUInt32BE(start - 4);
  return inflateSync(icon.subarray(start + 4, start + 4 + length));
}

function alphaAt(pixels: Buffer, size: number, x: number, y: number): number {
  const rowStart = y * (size * 4 + 1);
  expect(pixels[rowStart]).toBe(0);
  return pixels[rowStart + 1 + x * 4 + 3] as number;
}

describe("renderBundleIcon", () => {
  it("writes a PNG whose header declares the requested square size", () => {
    const icon: Buffer = renderBundleIcon(256);
    expect(icon.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    expect(icon.subarray(12, 16).toString("latin1")).toBe("IHDR");
    expect(icon.readUInt32BE(16)).toBe(256);
    expect(icon.readUInt32BE(20)).toBe(256);
    expect(icon[24]).toBe(8);
    expect(icon[25]).toBe(6);
  });

  it("keeps the corners transparent and the middle opaque, so the mark is a rounded tile", () => {
    const size = 64;
    const pixels = decodePixels(renderBundleIcon(size));
    expect(alphaAt(pixels, size, 0, 0)).toBe(0);
    expect(alphaAt(pixels, size, size - 1, 0)).toBe(0);
    expect(alphaAt(pixels, size, size - 1, size - 1)).toBe(0);
    expect(alphaAt(pixels, size, size / 2, size / 2)).toBe(255);
  });

  it("produces the same bytes every time", () => {
    expect(renderBundleIcon(64)).toEqual(renderBundleIcon(64));
  });
});
