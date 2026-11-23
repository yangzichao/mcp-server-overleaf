import fc from "fast-check";

import type { ImageHeader } from "../../../src/images/readImageHeader.js";

/**
 * Image files built byte by byte from each format's specification, as far as their headers go:
 * PNG's IHDR chunk, JPEG marker segments up to the start of frame, GIF's logical screen, and
 * WebP's three flavours. What follows the header is filler, which a header reader never reads.
 */

export interface GeneratedImage {
  readonly header: ImageHeader;
  readonly bytes: Uint8Array;
}

function uint16BigEndian(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function uint16LittleEndian(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff];
}

function uint24LittleEndian(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff];
}

function uint32BigEndian(value: number): number[] {
  return [...uint16BigEndian(Math.floor(value / 0x10000)), ...uint16BigEndian(value % 0x10000)];
}

function uint32LittleEndian(value: number): number[] {
  return [...uint16LittleEndian(value % 0x10000), ...uint16LittleEndian(Math.floor(value / 0x10000))];
}

const ascii = (text: string) => [...text].map((character) => character.charCodeAt(0));
const filler = fc.uint8Array({ maxLength: 40 }).map((bytes) => [...bytes]);

const png: fc.Arbitrary<GeneratedImage> = fc
  .record({
    width: fc.integer({ min: 1, max: 0x7fffffff }),
    height: fc.integer({ min: 1, max: 0x7fffffff }),
    rest: filler,
  })
  .map(({ width, height, rest }) => ({
    header: { mimeType: "image/png", width, height },
    bytes: new Uint8Array([
      ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      ...uint32BigEndian(13),
      ...ascii("IHDR"),
      ...uint32BigEndian(width),
      ...uint32BigEndian(height),
      ...[8, 2, 0, 0, 0],
      ...[0, 0, 0, 0],
      ...rest,
    ]),
  }));

/** A segment that comes before the frame: APPn, a comment, tables, or a restart interval. */
const jpegSegmentBeforeFrame = fc.oneof(
  fc
    .record({
      marker: fc.constantFrom(0xe0, 0xe1, 0xed, 0xef, 0xfe, 0xdb, 0xc4, 0xdd, 0xcc),
      payload: fc.uint8Array({ maxLength: 30 }),
      fillBytes: fc.nat({ max: 2 }),
    })
    .map(({ marker, payload, fillBytes }) => [
      ...new Array<number>(fillBytes).fill(0xff),
      0xff,
      marker,
      ...uint16BigEndian(payload.length + 2),
      ...payload,
    ]),
  fc.constant([0xff, 0x01]),
);

const jpeg: fc.Arbitrary<GeneratedImage> = fc
  .record({
    width: fc.integer({ min: 1, max: 0xffff }),
    height: fc.integer({ min: 1, max: 0xffff }),
    segments: fc.array(jpegSegmentBeforeFrame, { maxLength: 4 }),
    frameMarker: fc.constantFrom(0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc7, 0xc9, 0xcb, 0xcd, 0xcf),
    rest: filler,
  })
  .map(({ width, height, segments, frameMarker, rest }) => ({
    header: { mimeType: "image/jpeg", width, height },
    bytes: new Uint8Array([
      0xff,
      0xd8,
      ...segments.flat(),
      0xff,
      frameMarker,
      ...uint16BigEndian(17),
      8,
      ...uint16BigEndian(height),
      ...uint16BigEndian(width),
      3,
      ...rest,
    ]),
  }));

const gif: fc.Arbitrary<GeneratedImage> = fc
  .record({
    version: fc.constantFrom("GIF87a", "GIF89a"),
    width: fc.integer({ min: 1, max: 0xffff }),
    height: fc.integer({ min: 1, max: 0xffff }),
    rest: filler,
  })
  .map(({ version, width, height, rest }) => ({
    header: { mimeType: "image/gif", width, height },
    bytes: new Uint8Array([
      ...ascii(version),
      ...uint16LittleEndian(width),
      ...uint16LittleEndian(height),
      ...rest,
    ]),
  }));

function riffWebp(chunk: string, payload: readonly number[], rest: readonly number[]): Uint8Array {
  const body = [
    ...ascii("WEBP"),
    ...ascii(chunk),
    ...uint32LittleEndian(payload.length),
    ...payload,
    ...rest,
  ];
  return new Uint8Array([...ascii("RIFF"), ...uint32LittleEndian(body.length), ...body]);
}

const webpExtended: fc.Arbitrary<GeneratedImage> = fc
  .record({
    width: fc.integer({ min: 1, max: 0x1000000 }),
    height: fc.integer({ min: 1, max: 0x1000000 }),
    flags: fc.integer({ min: 0, max: 0xff }),
    rest: filler,
  })
  .map(({ width, height, flags, rest }) => ({
    header: { mimeType: "image/webp", width, height },
    bytes: riffWebp(
      "VP8X",
      [flags, 0, 0, 0, ...uint24LittleEndian(width - 1), ...uint24LittleEndian(height - 1)],
      rest,
    ),
  }));

const webpLossy: fc.Arbitrary<GeneratedImage> = fc
  .record({
    width: fc.integer({ min: 1, max: 0x3fff }),
    height: fc.integer({ min: 1, max: 0x3fff }),
    widthScale: fc.integer({ min: 0, max: 3 }),
    heightScale: fc.integer({ min: 0, max: 3 }),
    frameTag: fc.uint8Array({ minLength: 3, maxLength: 3 }),
    rest: filler,
  })
  .map(({ width, height, widthScale, heightScale, frameTag, rest }) => ({
    header: { mimeType: "image/webp", width, height },
    bytes: riffWebp(
      "VP8 ",
      [
        ...frameTag,
        0x9d,
        0x01,
        0x2a,
        ...uint16LittleEndian(width | (widthScale << 14)),
        ...uint16LittleEndian(height | (heightScale << 14)),
      ],
      rest,
    ),
  }));

const webpLossless: fc.Arbitrary<GeneratedImage> = fc
  .record({
    width: fc.integer({ min: 1, max: 0x4000 }),
    height: fc.integer({ min: 1, max: 0x4000 }),
    alphaAndVersion: fc.integer({ min: 0, max: 0x0f }),
    rest: filler,
  })
  .map(({ width, height, alphaAndVersion, rest }) => {
    // 14 bits of width - 1, 14 bits of height - 1, one alpha bit and three version bits.
    const packed = width - 1 + (height - 1) * 0x4000 + alphaAndVersion * 0x10000000;
    return {
      header: { mimeType: "image/webp", width, height },
      bytes: riffWebp("VP8L", [0x2f, ...uint32LittleEndian(packed)], rest),
    };
  });

export const generatedImage: fc.Arbitrary<GeneratedImage> = fc.oneof(
  png,
  jpeg,
  gif,
  webpExtended,
  webpLossy,
  webpLossless,
);

/** The first bytes of each supported format, to put random bytes behind. */
export const IMAGE_SIGNATURES: readonly (readonly number[])[] = [
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  [0xff, 0xd8, 0xff],
  ascii("GIF87a"),
  ascii("GIF89a"),
  [...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBPVP8X")],
  [...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBPVP8 ")],
  [...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBPVP8L")],
];
