/**
 * Overleaf's editor cannot hold characters outside the Basic Multilingual Plane, such as emoji or
 * the mathematical alphanumerics (𝔸, 𝒞), nor a NUL. The web editor's `filter-characters.ts`
 * replaces them with U+FFFD as they are typed, and document-updater's `_sanitizeUpdate` does the
 * same to every insertion it receives, so one sent here would arrive as "��". Refusing it says so
 * before the paper is changed; LaTeX has a command for each of them.
 */
const UNSUPPORTED_CHARACTER_PATTERN = /[\0\uD800-\uDFFF]/;

export function requireEditorSafeText(text: string, argumentName: string): void {
  const match = UNSUPPORTED_CHARACTER_PATTERN.exec(text);
  if (!match) return;
  const character = text.codePointAt(match.index) ?? 0;
  const shown =
    character === 0
      ? "NUL"
      : `"${String.fromCodePoint(character)}" (U+${character.toString(16).toUpperCase()})`;
  throw new Error(
    `${argumentName} contains ${shown}, which Overleaf's editor stores as the replacement character "�", so nothing was changed. ` +
      "Write it as a LaTeX command instead, for example \\mathbb{A} for 𝔸, or remove it.",
  );
}
