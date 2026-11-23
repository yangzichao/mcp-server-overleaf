/** A real 3 by 2 PNG written by Pillow, the same one tests/images reads. */
export const SMALL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAFElEQVR4nGM8wcXFAAZMEIqBgQEAEHIA4C4UN34AAAAASUVORK5CYII=",
  "base64",
);

/** A PNG signature and header claiming 10 by 10 pixels, padded with zeros to `totalBytes`. */
export function paddedPng(totalBytes: number): Buffer {
  const bytes = Buffer.alloc(totalBytes);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  bytes.writeUInt32BE(10, 16);
  bytes.writeUInt32BE(10, 20);
  return bytes;
}
