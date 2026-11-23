import { locationOf, type SourceLocation, scanSource } from "../source/scannedSource.js";
import { BibliographyCursor } from "./bibliographyCursor.js";

export interface ScannedBibliographyEntry {
  readonly entryTypeInLowerCase: string;
  readonly key: string;
  readonly location: SourceLocation;
  readonly fields: ReadonlyMap<string, string> | "cut short by an error";
}

type EntryRead = Omit<ScannedBibliographyEntry, "location">;

/**
 * Outside an entry BibTeX reads nothing but `@`, so an `@` inside a field value starts no entry,
 * and after an error it goes on from the character it rejected.
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

function readCommandOrEntry(cursor: BibliographyCursor): EntryRead | undefined {
  cursor.skipWhitespace();
  const entryTypeInLowerCase = cursor.readName().toLowerCase();
  // @comment comments out only its own name: BibTeX reads on right after it.
  if (entryTypeInLowerCase === "" || entryTypeInLowerCase === "comment") return undefined;
  cursor.skipWhitespace();
  const opener = cursor.peek();
  if (opener !== "{" && opener !== "(") return undefined;
  const closer = opener === "{" ? "}" : ")";
  cursor.position += 1;
  cursor.skipWhitespace();

  if (entryTypeInLowerCase === "string" || entryTypeInLowerCase === "preamble") {
    skipCommandBody(cursor, closer, entryTypeInLowerCase === "string");
    return undefined;
  }
  const key = cursor.readKey(closer);
  cursor.skipWhitespace();
  const fields =
    cursor.peek() === "," || cursor.peek() === closer ? readFields(cursor, closer) : "cut short by an error";
  return key === "" ? undefined : { entryTypeInLowerCase, key, fields };
}

function readFields(
  cursor: BibliographyCursor,
  closer: string,
): Map<string, string> | "cut short by an error" {
  const fields = new Map<string, string>();
  for (;;) {
    cursor.skipWhitespace();
    if (cursor.peek() === closer) {
      cursor.position += 1;
      return fields;
    }
    if (cursor.peek() !== ",") return "cut short by an error";
    cursor.position += 1;
    cursor.skipWhitespace();
    if (cursor.peek() === closer) continue;
    const name = cursor.readName().toLowerCase();
    cursor.skipWhitespace();
    if (name === "" || cursor.peek() !== "=") return "cut short by an error";
    cursor.position += 1;
    const value = cursor.readValue();
    if (value === null) return "cut short by an error";
    fields.set(name, value.trim());
  }
}

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
