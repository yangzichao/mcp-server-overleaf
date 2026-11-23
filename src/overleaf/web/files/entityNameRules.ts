import { RequestNotSentError } from "../overleafWebErrors.js";

/**
 * The checks a file or folder name has to pass in Overleaf: `SafePath.isCleanFilename` and
 * `isBlockedFilename` in `Features/Project/SafePath.mjs`, and the length check
 * `EditorHttpController` makes before anything else. Checking here turns Overleaf's bare 400
 * into a reason. SafePath's character class has no `u` flag, so it refuses each half of a
 * surrogate pair, which means any character outside the Basic Multilingual Plane, emoji included.
 */

const LONGEST_ENTITY_NAME = 149;
const FORBIDDEN_PRINTABLE_CHARACTERS = /[/\\*]/;
const BLOCKED_NAMES = new Set([
  "prototype",
  "constructor",
  "toString",
  "toLocaleString",
  "valueOf",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "__defineGetter__",
  "__lookupGetter__",
  "__defineSetter__",
  "__lookupSetter__",
  "__proto__",
]);

function isForbiddenCodeUnit(code: number): boolean {
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f) || (code >= 0xd800 && code <= 0xdfff);
}

function hasForbiddenCharacter(name: string): boolean {
  if (FORBIDDEN_PRINTABLE_CHARACTERS.test(name)) return true;
  for (let index = 0; index < name.length; index += 1) {
    if (isForbiddenCodeUnit(name.charCodeAt(index))) return true;
  }
  return false;
}

export function checkEntityName(name: string): string {
  if (name.length === 0) throw new RequestNotSentError("A file or folder name cannot be empty.");
  if (name.length > LONGEST_ENTITY_NAME) {
    throw new RequestNotSentError(
      `"${name}" is too long: Overleaf allows ${LONGEST_ENTITY_NAME} characters.`,
    );
  }
  if (hasForbiddenCharacter(name)) {
    throw new RequestNotSentError(
      `"${name}" contains a character Overleaf does not allow in a name: / \\ *, control characters, or emoji and other characters outside the Basic Multilingual Plane.`,
    );
  }
  if (name === "." || name === ".." || name !== name.trim()) {
    throw new RequestNotSentError(
      `"${name}" is not a name Overleaf allows: no ".", "..", or spaces at either end.`,
    );
  }
  if (BLOCKED_NAMES.has(name)) throw new RequestNotSentError(`Overleaf reserves the name "${name}".`);
  return name;
}
