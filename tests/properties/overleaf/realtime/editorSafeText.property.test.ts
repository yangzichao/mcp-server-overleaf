import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { requireEditorSafeText } from "../../../../src/overleaf/realtime/editorSafeText.js";

function holdsUnsupportedCodeUnit(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index);
    if (codeUnit === 0 || (codeUnit >= 0xd800 && codeUnit <= 0xdfff)) return true;
  }
  return false;
}

const editorText = fc.oneof(
  fc.string({ unit: "grapheme" }),
  fc.string({ unit: "binary" }),
  fc
    .array(fc.constantFrom("a", "\\mathbb{A}", "北京", "é", "\0", "𝔸", "😀", "\uD800", "\uDFFF", "�"), {
      maxLength: 6,
    })
    .map((pieces) => pieces.join("")),
);

describe("requireEditorSafeText properties", () => {
  it("refuses exactly the texts holding a NUL or any surrogate code unit, naming the argument", () => {
    fc.assert(
      fc.property(editorText, (text) => {
        if (holdsUnsupportedCodeUnit(text)) {
          expect(() => requireEditorSafeText(text, "replaceWith")).toThrow(/^replaceWith contains /);
        } else {
          expect(() => requireEditorSafeText(text, "replaceWith")).not.toThrow();
        }
      }),
    );
  });

  it("names the first unsupported character by its code point", () => {
    fc.assert(
      fc.property(
        fc.string({ unit: "grapheme-ascii" }),
        fc.constantFrom("😀", "𝔸", "\uD834"),
        (prefix, character) => {
          fc.pre(!prefix.includes("\0"));
          const codePoint = (character.codePointAt(0) ?? 0).toString(16).toUpperCase();
          expect(() => requireEditorSafeText(prefix + character, "findText")).toThrow(`(U+${codePoint})`);
        },
      ),
    );
  });
});
