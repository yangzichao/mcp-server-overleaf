import { locationOf, type SourceLocation, scanSource } from "../source/scannedSource.js";
import { BibliographyCursor } from "./bibliographyCursor.js";

/** One entry of a .bib file, read as BibTeX reads it. */
export interface ScannedBibliographyEntry {
  /** Lower-cased. */
  readonly entryType: string;
  readonly key: string;
  /** Where the entry's `@` is. */
  readonly location: SourceLocation;
  /**
   * Lower-cased field names with their values, or null when BibTeX stops at an error inside the
   * entry. Such an entry still defines its key for BibTeX.
   */
  readonly fields: ReadonlyMap<string, string> | null;
}

type EntryRead = Omit<ScannedBibliographyEntry, "location">;

/**
 * The entries of a .bib file. Outside an entry BibTeX reads nothing but `@`, so an `@` inside a
 * field value starts no entry, and after an error it goes on from the character it rejected.
 * A line starting with `%` is skipped, as biber skips it, even though classic BibTeX would not.
 */
export function scanBibliographyEntries(
  path: string,
  bibliographySource: string,
): ScannedBibliographyEntry[] {
  const text = bibliographySource.replace(/^[ \t]*%.*$/gm, "");
  const source = scanSource(path, text);
  const entries: ScannedBibliographyEntry[] = [];
  let position = 0;
  for (;;) {
    const at = text.indexOf("@", position);
    if (at === -1) return entries;
    const cursor = new BibliographyCursor(text, at + 1);
    const entry = readCommandOrEntry(cursor);
    if (entry) entries.push({ ...entry, location: locationOf(source, at) });
    position = cursor.position;
  }
}

/** Reads from just after an `@`, and leaves the cursor where BibTeX looks for the next one. */
function readCommandOrEntry(cursor: BibliographyCursor): EntryRead | undefined {
  cursor.skipWhitespace();
  const entryType = cursor.readName().toLowerCase();
  // @comment comments out only its own name: BibTeX reads on right after it.
  if (entryType === "" || entryType === "comment") return undefined;
  cursor.skipWhitespace();
  const opener = cursor.peek();
  if (opener !== "{" && opener !== "(") return undefined;
  const closer = opener === "{" ? "}" : ")";
  cursor.position += 1;
  cursor.skipWhitespace();

  if (entryType === "string" || entryType === "preamble") {
    skipCommandBody(cursor, closer, entryType === "string");
    return undefined;
  }
  const key = cursor.readKey(closer);
  cursor.skipWhitespace();
  // A key needs a comma or the closer after it. BibTeX also defines a key followed by anything
  // else, with none of its fields read, and reports the error.
  if (cursor.peek() !== "," && cursor.peek() !== closer) return undefined;
  const fields = readFields(cursor, closer);
  return key === "" ? undefined : { entryType, key, fields };
}

/** Fields from the comma after the key, or from the closer of an entry that has none. */
function readFields(cursor: BibliographyCursor, closer: string): Map<string, string> | null {
  const fields = new Map<string, string>();
  for (;;) {
    cursor.skipWhitespace();
    if (cursor.peek() === closer) {
      cursor.position += 1;
      return fields;
    }
    if (cursor.peek() !== ",") return null;
    cursor.position += 1;
    cursor.skipWhitespace();
    // A comma may come right before the closer.
    if (cursor.peek() === closer) continue;
    const name = cursor.readName().toLowerCase();
    cursor.skipWhitespace();
    if (name === "" || cursor.peek() !== "=") return null;
    cursor.position += 1;
    const value = cursor.readValue();
    if (value === null) return null;
    fields.set(name, value.trim());
  }
}

/** Reads past `@string{name = value}` or `@preamble{value}`, which define no key. */
function skipCommandBody(cursor: BibliographyCursor, closer: string, namesAMacro: boolean): void {
  if (namesAMacro) {
    if (cursor.readName() === "") return;
    cursor.skipWhitespace();
    if (cursor.peek() !== "=") return;
    cursor.position += 1;
  }
  if (cursor.readValue() === null) return;
  cursor.skipWhitespace();
  if (cursor.peek() === closer) cursor.position += 1;
}
