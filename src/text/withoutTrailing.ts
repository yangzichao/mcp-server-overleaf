/** `text` without the run of `character` at its end, found in one pass from the end. */
export function withoutTrailing(text: string, character: string): string {
  let end = text.length;
  while (end > 0 && text[end - 1] === character) end -= 1;
  return text.slice(0, end);
}
