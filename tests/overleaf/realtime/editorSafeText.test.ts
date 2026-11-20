import { describe, expect, it } from "vitest";

import { requireEditorSafeText } from "../../../src/overleaf/realtime/editorSafeText.js";

describe("requireEditorSafeText", () => {
  it("accepts text in the Basic Multilingual Plane, Chinese, accents and LaTeX included", () => {
    expect(() =>
      requireEditorSafeText("中文 ünïcode $$x$$ \\mathbb{A} — “quoted”", "replaceWith"),
    ).not.toThrow();
  });

  it("refuses an emoji, naming it and its code point", () => {
    expect(() => requireEditorSafeText("done 😀", "replaceWith")).toThrow(/"😀" \(U\+1F600\)/);
  });

  it("refuses a mathematical alphanumeric and suggests the LaTeX command", () => {
    expect(() => requireEditorSafeText("𝔸", "replaceWith")).toThrow(/\\mathbb\{A\}/);
  });

  it("refuses a NUL", () => {
    expect(() => requireEditorSafeText("a\0b", "replaceWith")).toThrow(/contains NUL/);
  });
});
