import { describe, expect, it } from "vitest";

import { redactSecrets } from "../../src/config/secretRedaction.js";

// Shaped like a real Overleaf token, but not one. Never put a live token in a test.
const token = "olp_TESTTOKENnotarealsecret0000000000000";

describe("redactSecrets", () => {
  it("removes the token from a git error message", () => {
    const message = `fatal: could not read Password for 'https://git:${token}@git.overleaf.com'`;
    const redacted = redactSecrets(message, [token]);
    expect(redacted).not.toContain(token);
    expect(redacted).toContain("***REDACTED***");
  });

  it("removes every occurrence, not just the first", () => {
    expect(redactSecrets(`${token} and again ${token}`, [token])).toBe(
      "***REDACTED*** and again ***REDACTED***",
    );
  });

  it("leaves text without the secret untouched", () => {
    expect(redactSecrets("nothing to hide here", [token])).toBe("nothing to hide here");
  });

  it("handles several secrets at once", () => {
    expect(redactSecrets("aaaa then bbbb", ["aaaa", "bbbb"])).toBe("***REDACTED*** then ***REDACTED***");
  });

  // Redacting a one or two character "secret" would shred every message it appears in,
  // which would hide the actual error rather than the token.
  it("ignores secrets too short to be meaningful", () => {
    expect(redactSecrets("a fatal error", ["a"])).toBe("a fatal error");
    expect(redactSecrets("abc def", ["abc"])).toBe("abc def");
  });

  it("redacts a secret of exactly the minimum length", () => {
    expect(redactSecrets("abcd def", ["abcd"])).toBe("***REDACTED*** def");
  });

  it("copes with an empty secret list", () => {
    expect(redactSecrets("untouched", [])).toBe("untouched");
  });

  it("copes with an empty string", () => {
    expect(redactSecrets("", [token])).toBe("");
  });
});
