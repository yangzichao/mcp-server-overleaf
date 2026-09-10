import { deflateSync } from "node:zlib";

/**
 * Draws the extension icon as a PNG.
 *
 * It is generated rather than committed so the only copy of the artwork is the code that
 * produces it, and so the bytes are reproducible on every machine that builds the bundle.
 * The mark is a plain document sheet: nothing here imitates Overleaf's own logo.
 */

const REFERENCE_SIZE = 512;
const SAMPLES_PER_AXIS = 3;

const TRANSPARENT = [0, 0, 0, 0];
const BACKGROUND = [31, 41, 55, 255];
const SHEET = [255, 255, 255, 255];
const FOLD = [203, 213, 225, 255];
const ACCENT = [16, 185, 129, 255];
const BODY_TEXT = [148, 163, 184, 255];

const SHEET_BOX = { left: 136, top: 104, right: 376, bottom: 408, radius: 18 };
const FOLD_SIZE = 72;
const FOLD_DIAGONAL = SHEET_BOX.right - FOLD_SIZE - SHEET_BOX.top;

const TEXT_BARS = [
  { left: 172, top: 178, right: 268, bottom: 200, color: ACCENT },
  { left: 172, top: 238, right: 340, bottom: 258, color: BODY_TEXT },
  { left: 172, top: 280, right: 340, bottom: 300, color: BODY_TEXT },
  { left: 172, top: 322, right: 292, bottom: 342, color: BODY_TEXT },
];

function insideRoundedBox(x, y, box) {
  const radius = box.radius ?? (box.bottom - box.top) / 2;
  if (x < box.left || x > box.right || y < box.top || y > box.bottom) return false;
  const nearestX = Math.min(Math.max(x, box.left + radius), box.right - radius);
  const nearestY = Math.min(Math.max(y, box.top + radius), box.bottom - radius);
  const distanceX = x - nearestX;
  const distanceY = y - nearestY;
  return distanceX * distanceX + distanceY * distanceY <= radius * radius;
}

function insideSheet(x, y) {
  return insideRoundedBox(x, y, SHEET_BOX) && x - y <= FOLD_DIAGONAL;
}

function insideFold(x, y) {
  return insideSheet(x, y) && x >= SHEET_BOX.right - FOLD_SIZE && y <= SHEET_BOX.top + FOLD_SIZE;
}

function colorAtReferencePoint(x, y) {
  for (const bar of TEXT_BARS) {
    if (insideRoundedBox(x, y, bar)) return bar.color;
  }
  if (insideFold(x, y)) return FOLD;
  if (insideSheet(x, y)) return SHEET;
  if (
    insideRoundedBox(x, y, { left: 0, top: 0, right: REFERENCE_SIZE, bottom: REFERENCE_SIZE, radius: 112 })
  ) {
    return BACKGROUND;
  }
  return TRANSPARENT;
}

/** Averages in premultiplied space so an edge against transparency keeps its own hue. */
function averageSamples(pixelX, pixelY, scale) {
  let red = 0;
  let green = 0;
  let blue = 0;
  let alpha = 0;
  for (let sampleY = 0; sampleY < SAMPLES_PER_AXIS; sampleY += 1) {
    for (let sampleX = 0; sampleX < SAMPLES_PER_AXIS; sampleX += 1) {
      const x = (pixelX + (sampleX + 0.5) / SAMPLES_PER_AXIS) / scale;
      const y = (pixelY + (sampleY + 0.5) / SAMPLES_PER_AXIS) / scale;
      const [sampleRed, sampleGreen, sampleBlue, sampleAlpha] = colorAtReferencePoint(x, y);
      const weight = sampleAlpha / 255;
      red += sampleRed * weight;
      green += sampleGreen * weight;
      blue += sampleBlue * weight;
      alpha += sampleAlpha;
    }
  }
  const sampleCount = SAMPLES_PER_AXIS * SAMPLES_PER_AXIS;
  const averageAlpha = alpha / sampleCount;
  if (averageAlpha === 0) return TRANSPARENT;
  const coverage = averageAlpha / 255;
  return [
    Math.round(red / sampleCount / coverage),
    Math.round(green / sampleCount / coverage),
    Math.round(blue / sampleCount / coverage),
    Math.round(averageAlpha),
  ];
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value;
  }
  return table;
})();

function crc32(bytes) {
  let checksum = -1;
  for (const byte of bytes) checksum = CRC_TABLE[(checksum ^ byte) & 0xff] ^ (checksum >>> 8);
  return (checksum ^ -1) >>> 0;
}

function pngChunk(type, body) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);
  const typeAndBody = Buffer.concat([Buffer.from(type, "latin1"), body]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typeAndBody), 0);
  return Buffer.concat([length, typeAndBody, checksum]);
}

export function renderBundleIcon(size = REFERENCE_SIZE) {
  const scale = size / REFERENCE_SIZE;
  const scanlines = Buffer.alloc(size * (size * 4 + 1));
  let offset = 0;
  for (let pixelY = 0; pixelY < size; pixelY += 1) {
    scanlines[offset] = 0; // filter type "none"
    offset += 1;
    for (let pixelX = 0; pixelX < size; pixelX += 1) {
      const [red, green, blue, alpha] = averageSamples(pixelX, pixelY, scale);
      scanlines[offset] = red;
      scanlines[offset + 1] = green;
      scanlines[offset + 2] = blue;
      scanlines[offset + 3] = alpha;
      offset += 4;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: truecolour with alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
