import { detectRasterImage, type ModelImageMimeType } from "./readImageHeader.js";

export interface ImageForModel {
  readonly mimeType: ModelImageMimeType;
  readonly base64: string;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
}

/**
 * Claude accepts up to 10 MB of base64 per image on its own API, but 5 MB on Amazon Bedrock
 * and on Google Cloud, and an MCP server cannot know which one its client talks to. 3,750,000
 * bytes encode to exactly 5,000,000 base64 characters, inside the smaller limit however a
 * megabyte is counted.
 */
export const MAXIMUM_IMAGE_BYTES = 3_750_000;

/**
 * The largest image Claude accepts is 8000 by 8000 pixels. Larger images within that are
 * scaled down by the model itself (to 2576 pixels on the long edge for recent models), so
 * nothing is gained by refusing them here.
 */
export const MAXIMUM_IMAGE_SIDE_PIXELS = 8000;

export class ImageNotReadableError extends Error {}

const FORMAT_NAMES: Record<ModelImageMimeType, string> = {
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/gif": "GIF",
  "image/webp": "WebP",
};

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

function textStart(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.subarray(0, 512))
    .replace(/^\uFEFF/, "")
    .trimStart();
}

const RENDER_FIRST = "Render it to PNG first, then read the PNG";

/** True when the text opens an SVG file, after any XML declaration, comments and doctype. */
function startsAsSvg(start: string): boolean {
  let rest = start.replace(/^<\?xml[^>]*>\s*/i, "");
  while (rest.startsWith("<!--")) {
    const commentEnd = rest.indexOf("-->", 4);
    if (commentEnd === -1) return false;
    rest = rest.slice(commentEnd + 3).trimStart();
  }
  rest = rest.replace(/^<!DOCTYPE svg[^>]*>\s*/i, "");
  return /^<svg[\s>]/i.test(rest);
}

/**
 * How to make a PDF, PostScript or SVG figure visible, told by its first bytes or its name; an
 * empty `bytes` decides by name alone. Undefined for any other file.
 */
export function suggestImageConversion(bytes: Uint8Array, path: string): string | undefined {
  const start = textStart(bytes);
  const extension = extensionOf(path);
  if (start.startsWith("%PDF-") || extension === "pdf") {
    return `${path} is a PDF, which is not sent as an image. ${RENDER_FIRST}, for example with \`pdftoppm -png -r 150 -f 1 -l 1\`.`;
  }
  const isBinaryEps = bytes[0] === 0xc5 && bytes[1] === 0xd0 && bytes[2] === 0xd3 && bytes[3] === 0xc6;
  if (start.startsWith("%!PS") || isBinaryEps || extension === "eps" || extension === "ps") {
    return `${path} is PostScript (EPS), which is not sent as an image. ${RENDER_FIRST}, for example with Ghostscript or \`epstopdf\` and then \`pdftoppm -png\`.`;
  }
  if (startsAsSvg(start) || extension === "svg") {
    return `${path} is an SVG drawing, which is not sent as an image. ${RENDER_FIRST}, for example with \`rsvg-convert\` or Inkscape. Its source is text, so it can also be read as a file.`;
  }
  return undefined;
}

/** Why a file that is not PNG, JPEG, GIF or WebP cannot be shown, with what to do instead. */
function explainUnsupported(bytes: Uint8Array, path: string): string {
  return (
    suggestImageConversion(bytes, path) ??
    `${path} is not a PNG, JPEG, GIF or WebP image, the formats the model can see. Convert it to PNG first.`
  );
}

/**
 * An image file as an MCP image block takes it: the media type and base64 data, with its size
 * in pixels. The format is read from the file's first bytes, not its name. Animated GIF and
 * WebP files are accepted, but the model sees only the first frame.
 */
export function prepareImageForModel(bytes: Uint8Array, path: string): ImageForModel {
  const detection = detectRasterImage(bytes);
  if (detection.kind === "other") throw new ImageNotReadableError(explainUnsupported(bytes, path));
  if (detection.kind === "damaged") {
    throw new ImageNotReadableError(
      `${path} starts like a ${FORMAT_NAMES[detection.mimeType]} image, but its size could not be read; the file looks damaged or cut short.`,
    );
  }
  const { mimeType, width, height } = detection.header;
  if (bytes.length > MAXIMUM_IMAGE_BYTES) {
    throw new ImageNotReadableError(
      `${path} is ${bytes.length} bytes, more than the ${MAXIMUM_IMAGE_BYTES} an image sent to the model may have. Save a smaller or more compressed copy (for example a JPEG, or a PNG scaled down) and read that.`,
    );
  }
  if (width > MAXIMUM_IMAGE_SIDE_PIXELS || height > MAXIMUM_IMAGE_SIDE_PIXELS) {
    throw new ImageNotReadableError(
      `${path} is ${width} by ${height} pixels; the model accepts at most ${MAXIMUM_IMAGE_SIDE_PIXELS} on each side. Save a scaled-down copy and read that.`,
    );
  }
  const base64 = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
  return { mimeType, base64, width, height, byteLength: bytes.length };
}
