/** The raster formats Claude reads, and the media type each is sent as. */
export type ModelImageMimeType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

interface ImageHeader {
  readonly mimeType: ModelImageMimeType;
  readonly width: number;
  readonly height: number;
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function uint16BigEndian(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function uint16LittleEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function uint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return uint16LittleEndian(bytes, offset) | ((bytes[offset + 2] ?? 0) << 16);
}

function uint32BigEndian(bytes: Uint8Array, offset: number): number {
  return uint16BigEndian(bytes, offset) * 0x10000 + uint16BigEndian(bytes, offset + 2);
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** IHDR is always the first chunk; width and height are its first two fields. */
function readPng(bytes: Uint8Array): ImageHeader | undefined {
  if (bytes.length < 24 || ascii(bytes, 12, 4) !== "IHDR") return undefined;
  return { mimeType: "image/png", width: uint32BigEndian(bytes, 16), height: uint32BigEndian(bytes, 20) };
}

/** Start-of-frame markers, baseline to arithmetic: every one carries the frame's size. */
function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/** Markers that stand alone, without a length: TEM, RST0-7 and SOI. */
function isStandaloneMarker(marker: number): boolean {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8);
}

/** Where the next marker starts, or the answer once a frame header, or the end, is reached. */
type JpegStep = { readonly next: number } | { readonly header: ImageHeader | undefined };

function readJpegSegment(bytes: Uint8Array, offset: number): JpegStep {
  if (bytes[offset] !== 0xff) return { header: undefined };
  const marker = bytes[offset + 1] ?? 0;
  if (marker === 0xff) return { next: offset + 1 }; // a fill byte
  if (isStandaloneMarker(marker)) return { next: offset + 2 };
  // The end of the image, or scan data before any frame.
  if (marker === 0xd9 || marker === 0xda) return { header: undefined };
  if (!isStartOfFrame(marker)) return { next: offset + 2 + uint16BigEndian(bytes, offset + 2) };
  if (offset + 9 > bytes.length) return { header: undefined };
  return {
    header: {
      mimeType: "image/jpeg",
      height: uint16BigEndian(bytes, offset + 5),
      width: uint16BigEndian(bytes, offset + 7),
    },
  };
}

/** Walks the marker segments after SOI to the first start-of-frame. */
function readJpeg(bytes: Uint8Array): ImageHeader | undefined {
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    const step = readJpegSegment(bytes, offset);
    if ("header" in step) return step.header;
    offset = step.next;
  }
  return undefined;
}

/** The logical screen size in the header, which every frame fits inside. */
function readGif(bytes: Uint8Array): ImageHeader | undefined {
  if (bytes.length < 10) return undefined;
  return { mimeType: "image/gif", width: uint16LittleEndian(bytes, 6), height: uint16LittleEndian(bytes, 8) };
}

/** The first chunk says which WebP flavour this is; each stores its size differently. */
function readWebp(bytes: Uint8Array): ImageHeader | undefined {
  const chunk = ascii(bytes, 12, 4);
  const data = 20;
  if (chunk === "VP8X" && bytes.length >= data + 10) {
    return {
      mimeType: "image/webp",
      width: uint24LittleEndian(bytes, data + 4) + 1,
      height: uint24LittleEndian(bytes, data + 7) + 1,
    };
  }
  if (chunk === "VP8 " && bytes.length >= data + 10 && startsWith(bytes, [0x9d, 0x01, 0x2a], data + 3)) {
    return {
      mimeType: "image/webp",
      width: uint16LittleEndian(bytes, data + 6) & 0x3fff,
      height: uint16LittleEndian(bytes, data + 8) & 0x3fff,
    };
  }
  if (chunk === "VP8L" && bytes.length >= data + 5 && bytes[data] === 0x2f) {
    const [b1, b2, b3, b4] = [
      bytes[data + 1] ?? 0,
      bytes[data + 2] ?? 0,
      bytes[data + 3] ?? 0,
      bytes[data + 4] ?? 0,
    ];
    return {
      mimeType: "image/webp",
      width: 1 + (b1 | ((b2 & 0x3f) << 8)),
      height: 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)),
    };
  }
  return undefined;
}

export type RasterImageDetection =
  | { readonly kind: "image"; readonly header: ImageHeader }
  /** The signature matched a supported format but the header was cut short or damaged. */
  | { readonly kind: "damaged"; readonly mimeType: ModelImageMimeType }
  | { readonly kind: "other" };

/** Identifies PNG, JPEG, GIF and WebP by their first bytes, never by the file name, and reads the size. */
export function detectRasterImage(bytes: Uint8Array): RasterImageDetection {
  const detect = (mimeType: ModelImageMimeType, read: (bytes: Uint8Array) => ImageHeader | undefined) => {
    const header = read(bytes);
    return header && header.width > 0 && header.height > 0
      ? ({ kind: "image", header } as const)
      : ({ kind: "damaged", mimeType } as const);
  };
  if (startsWith(bytes, PNG_SIGNATURE)) return detect("image/png", readPng);
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return detect("image/jpeg", readJpeg);
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return detect("image/gif", readGif);
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return detect("image/webp", readWebp);
  return { kind: "other" };
}
