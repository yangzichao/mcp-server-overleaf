/**
 * The comments a flattened document carries, so a reader can tell which file each part came
 * from and why an include was left as written. Each is one comment line: TeX skips it whole,
 * newline included, so it adds no space and no paragraph break.
 */

function onOneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function beginInlinedFileMarker(path: string, written: string): string {
  return `% ---- begin ${onOneLine(path)}, from ${onOneLine(written)} ----\n`;
}

/** No newline of its own: it takes the rest of the include's line, which must be blank or a comment. */
export function endInlinedFileMarker(path: string): string {
  return `% ---- end ${onOneLine(path)} ----`;
}

export function notInlinedMarker(reason: string): string {
  return `% ---- not inlined: ${onOneLine(reason)} ----\n`;
}
