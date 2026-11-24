import { describe, expect, it } from "vitest";

import { withoutTrailing } from "../../src/text/withoutTrailing.js";

describe("withoutTrailing", () => {
  it("removes the whole run at the end and nothing before it", () => {
    expect(withoutTrailing("https://git.overleaf.com///", "/")).toBe("https://git.overleaf.com");
    expect(withoutTrailing("a\n\nb\n\n", "\n")).toBe("a\n\nb");
  });

  it("returns an empty string for a text made only of the character", () => {
    expect(withoutTrailing("///", "/")).toBe("");
  });
});
