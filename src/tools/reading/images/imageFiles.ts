import {
  type ImageForModel,
  MAXIMUM_IMAGE_BYTES,
  MAXIMUM_IMAGE_SIDE_PIXELS,
  suggestImageConversion,
} from "../../../images/prepareImageForModel.js";
import type { ModelImageMimeType } from "../../../images/readImageHeader.js";
import type { ToolTextResult } from "../../toolContext.js";

/**
 * How read_file treats figures in both of its versions: a PNG, JPEG, GIF or WebP file comes back
 * as an image the model can see, and any other binary file as a refusal that says how to make
 * it visible.
 */

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

const FORMAT_NAMES: Record<ModelImageMimeType, string> = {
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/gif": "GIF",
  "image/webp": "WebP",
};

function withThousandsSeparators(count: number): string {
  return String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** The sentence both read_file descriptions carry about images. */
export const IMAGE_READ_DESCRIPTION = `A PNG, JPEG, GIF or WebP file comes back as an image the model can see, after a line giving its format, size in pixels and bytes; it may have at most ${withThousandsSeparators(MAXIMUM_IMAGE_BYTES)} bytes and ${MAXIMUM_IMAGE_SIDE_PIXELS} pixels a side, and takes no other read argument.`;

/** Decided by name, before anything is read; the format itself is then read from the bytes. */
export function isImageFilePath(path: string): boolean {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 && IMAGE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/** The image, after one line naming it, so the model knows which file it is looking at. */
export function imageToolResult(path: string, image: ImageForModel): ToolTextResult {
  return {
    content: [
      {
        type: "text",
        text: `${path}: ${FORMAT_NAMES[image.mimeType]} image, ${image.width} by ${image.height} pixels, ${image.byteLength} bytes.`,
      },
      { type: "image", data: image.base64, mimeType: image.mimeType },
    ],
  };
}

/** By name alone, so the editor can refuse a large upload without downloading it. */
export function describeUnreadableBinaryFile(path: string): string {
  return (
    suggestImageConversion(new Uint8Array(0), path) ??
    `${path} is a binary file, neither text nor an image the model can see (PNG, JPEG, GIF or WebP), so there is nothing to return.`
  );
}

/** An image comes back whole and as it is now, so the arguments that shape a text read are refused. */
export function assertWholeImageRead(path: string, textReadArguments: Record<string, unknown>): void {
  const given = Object.entries(textReadArguments)
    .filter(([, value]) => value !== undefined)
    .map(([name]) => name);
  if (given.length === 0) return;
  throw new Error(
    `${path} is an image, which read_file returns whole as it is now; ${given.join(", ")} ${given.length === 1 ? "applies" : "apply"} to text files only.`,
  );
}
