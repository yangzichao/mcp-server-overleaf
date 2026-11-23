import { locationOf, type SourceLocation, scanSource } from "../source/scannedSource.js";
import { BibliographyCursor } from "./bibliographyCursor.js";
import { BibliographyMacros } from "./bibliographyMacros.js";
import type { BibliographyReadingRules } from "./bibliographyReadingRules.js";

export interface BibliographyFile {
  readonly path: string;
  readonly text: string;
}

export interface ScannedBibliographyEntry {
  readonly entryTypeInLowerCase: string;
  readonly key: string;
  readonly location: SourceLocation;
  /** The first of each field read before the entry's closer, or before the error that stopped it. */
  readonly fields: ReadonlyMap<string, string>;
  readonly cutShortByAnError: boolean;
}

type EntryRead = Omit<ScannedBibliographyEntry, "location">;

/**
 * Reads .bib files in the order a document names them, sharing their @string macros. Outside an
 * entry BibTeX reads nothing but `@`, so an `@` inside a field value starts no entry, and after
 * an error it goes on from the character it rejected.
 */
export function scanBibliographyFiles(
  files: readonly BibliographyFile[],
  rules: BibliographyReadingRules,
): ScannedBibliographyEntry[] {
  const macros = new BibliographyMacros(rules);
  return files.flatMap((file) => scanBibliographyFile(file, rules, macros));
}

function scanBibliographyFile(
  file: BibliographyFile,
  rules: BibliographyReadingRules,
  macros: BibliographyMacros,
): ScannedBibliographyEntry[] {
  const text = rules.skipsLinesStartingWithPercent ? file.text.replace(/^[ \t]*%.*$/gm, "") : file.text;
  const source = scanSource(file.path, text);
  const lastLineStart = startOfTheLastLine(text);
  const entries: ScannedBibliographyEntry[] = [];
  let position = 0;
  for (;;) {
    const at = text.indexOf("@", position);
    if (at === -1) return entries;
    const cursor = new BibliographyCursor(text, at + 1);
    const entry = readCommandOrEntry(cursor, macros);
    if (entry) entries.push({ ...entry, location: locationOf(source, at) });
    position = cursor.position;
    if (rules.stopsAtTheLastLine && position >= lastLineStart) return entries;
  }
}

/** BibTeX ends a line at `\n` or at `\r`, so a file that ends in `\r\n` ends with an empty line. */
function startOfTheLastLine(text: string): number {
  const end = /[\n\r]$/.test(text) ? text.length - 1 : text.length;
  return Math.max(text.lastIndexOf("\n", end - 1), text.lastIndexOf("\r", end - 1)) + 1;
}

function readCommandOrEntry(cursor: BibliographyCursor, macros: BibliographyMacros): EntryRead | undefined {
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

  if (entryTypeInLowerCase === "string") {
    readMacroDefinition(cursor, closer, macros);
    return undefined;
  }
  if (entryTypeInLowerCase === "preamble") {
    if (cursor.readValue((name) => macros.expand(name)) !== null) skipCloser(cursor, closer);
    return undefined;
  }
  const key = cursor.readKey(closer);
  cursor.skipWhitespace();
  const fields = new Map<string, string>();
  const endsAtItsCloser =
    (cursor.peek() === "," || cursor.peek() === closer) && readFieldsInto(fields, cursor, closer, macros);
  return key === "" ? undefined : { entryTypeInLowerCase, key, fields, cutShortByAnError: !endsAtItsCloser };
}

/** False when an error stops the entry before its closer. A repeated field keeps its first value. */
function readFieldsInto(
  fields: Map<string, string>,
  cursor: BibliographyCursor,
  closer: string,
  macros: BibliographyMacros,
): boolean {
  for (;;) {
    cursor.skipWhitespace();
    if (cursor.peek() === closer) {
      cursor.position += 1;
      return true;
    }
    if (cursor.peek() !== ",") return false;
    cursor.position += 1;
    cursor.skipWhitespace();
    if (cursor.peek() === closer) continue;
    const name = cursor.readName().toLowerCase();
    cursor.skipWhitespace();
    if (name === "" || cursor.peek() !== "=") return false;
    cursor.position += 1;
    const value = cursor.readValue((macroName) => macros.expand(macroName));
    if (value === null) return false;
    if (!fields.has(name)) fields.set(name, value.trim());
  }
}

/**
 * BibTeX defines the name as its own lower-cased name as soon as it reads it, so that is what a
 * definition an error cuts short leaves behind.
 */
function readMacroDefinition(cursor: BibliographyCursor, closer: string, macros: BibliographyMacros): void {
  const name = cursor.readName();
  if (name === "") return;
  macros.define(name, name.toLowerCase());
  cursor.skipWhitespace();
  if (cursor.peek() !== "=") return;
  cursor.position += 1;
  const value = cursor.readValue((macroName) => macros.expand(macroName, name));
  if (value === null) return;
  macros.define(name, value);
  skipCloser(cursor, closer);
}

function skipCloser(cursor: BibliographyCursor, closer: string): void {
  cursor.skipWhitespace();
  if (cursor.peek() === closer) cursor.position += 1;
}
