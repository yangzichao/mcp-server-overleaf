import { type SourceLocation, scanSource } from "../latex/source/scannedSource.js";

/**
 * Whole .bib entries with their fields, for the checks that need more than the key. Field
 * names are lower-cased; values keep their inner braces, so `{BERT}` survives for whoever
 * reads it, and concatenations with `#` are joined. A malformed entry is skipped rather than
 * allowed to swallow the entries after it.
 */

export interface BibliographyRecord {
  readonly key: string;
  readonly entryType: string;
  readonly location: SourceLocation;
  readonly fields: ReadonlyMap<string, string>;
}

const ENTRY_START_PATTERN = /@\s*([A-Za-z]+)\s*([{(])/g;
const NOT_AN_ENTRY = new Set(["string", "preamble", "comment"]);

class BibliographyCursor {
  constructor(
    readonly text: string,
    public position: number,
  ) {}

  skipWhitespace(): void {
    while (/\s/.test(this.text[this.position] ?? "")) this.position += 1;
  }

  peek(): string {
    return this.text[this.position] ?? "";
  }

  readWhile(pattern: RegExp): string {
    const start = this.position;
    while (this.position < this.text.length && pattern.test(this.peek())) this.position += 1;
    return this.text.slice(start, this.position);
  }

  /** Reads `{...}` with nested braces, or `"..."` whose braces are balanced; returns the inside. */
  readDelimited(): string | null {
    const opener = this.peek();
    const closer = opener === "{" ? "}" : '"';
    const start = this.position + 1;
    let depth = 0;
    for (let index = start; index < this.text.length; index += 1) {
      const character = this.text[index];
      if (character === "\\") {
        index += 1;
      } else if (character === "{") {
        depth += 1;
      } else if (character === "}" && depth > 0) {
        depth -= 1;
      } else if (character === closer && depth === 0) {
        this.position = index + 1;
        return this.text.slice(start, index);
      }
    }
    return null;
  }

  /** One field value: delimited parts and bare words or numbers, joined by `#`. */
  readValue(): string | null {
    const parts: string[] = [];
    for (;;) {
      this.skipWhitespace();
      const part =
        this.peek() === "{" || this.peek() === '"' ? this.readDelimited() : this.readWhile(/[^\s,#})]/);
      // An empty bare word means `title = ,` or `title = }`, which BibTeX rejects too.
      if (part === null || part === "") return null;
      parts.push(part);
      this.skipWhitespace();
      if (this.peek() !== "#") return parts.join("");
      this.position += 1;
    }
  }
}

function readFields(cursor: BibliographyCursor, closer: string): Map<string, string> | null {
  const fields = new Map<string, string>();
  for (;;) {
    cursor.skipWhitespace();
    while (cursor.peek() === ",") {
      cursor.position += 1;
      cursor.skipWhitespace();
    }
    if (cursor.peek() === closer) return fields;
    const name = cursor.readWhile(/[A-Za-z0-9_:.+-]/).toLowerCase();
    cursor.skipWhitespace();
    if (name === "" || cursor.peek() !== "=") return null;
    cursor.position += 1;
    const value = cursor.readValue();
    if (value === null) return null;
    fields.set(name, value.trim());
  }
}

export function parseBibliographyRecords(path: string, bibliographySource: string): BibliographyRecord[] {
  const text = bibliographySource.replace(/^[ \t]*%.*$/gm, "");
  const source = scanSource(path, text);
  const records: BibliographyRecord[] = [];

  for (const start of text.matchAll(ENTRY_START_PATTERN)) {
    const entryType = (start[1] ?? "").toLowerCase();
    if (NOT_AN_ENTRY.has(entryType)) continue;
    const cursor = new BibliographyCursor(text, start.index + start[0].length);
    cursor.skipWhitespace();
    const key = cursor.readWhile(/[^,\s{}()]/);
    cursor.skipWhitespace();
    if (key === "" || cursor.peek() !== ",") continue;
    const fields = readFields(cursor, start[2] === "(" ? ")" : "}");
    if (fields)
      records.push({ key, entryType, location: { path, line: source.lineAt(start.index) }, fields });
  }
  return records;
}
