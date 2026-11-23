import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { mergeHandshakeCookies } from "../../../../src/overleaf/realtime/handshakeCookies.js";

const cookieName = fc.oneof(
  fc.constantFrom("overleaf_session2", "GCLB", "__cf_bm", "_ga"),
  fc.stringMatching(/^[A-Za-z0-9_-]{1,8}$/),
);
const cookieValue = fc.stringMatching(/^[A-Za-z0-9%._~+/=-]{0,12}$/);
const cookiePairs = fc.uniqueArray(fc.tuple(cookieName, cookieValue), {
  selector: ([name]) => name,
  maxLength: 4,
});
const cookieAttributes = fc.constantFrom(
  "",
  "; Path=/",
  "; Expires=Wed, 21 Oct 2026 07:28:00 GMT",
  "; HttpOnly; Secure",
);
const setCookieHeaders = fc.array(
  fc.oneof(
    fc
      .tuple(cookieName, cookieValue, cookieAttributes)
      .map(([name, value, attributes]) => `${name}=${value}${attributes}`),
    fc.string(),
    fc.constantFrom("bad\r\nInjected=1", "=novalue", "noequals", "x=\0"),
  ),
  { maxLength: 4 },
);

function readHeader(header: string): Map<string, string> {
  return new Map(
    header
      .split("; ")
      .filter((pair) => pair !== "")
      .map((pair) => [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)]),
  );
}

describe("mergeHandshakeCookies properties", () => {
  it("keeps every cookie the caller sent, with its value, whatever the handshake sets", () => {
    fc.assert(
      fc.property(cookiePairs, setCookieHeaders, (pairs, setCookies) => {
        const merged = readHeader(
          mergeHandshakeCookies(pairs.map(([name, value]) => `${name}=${value}`).join("; "), setCookies),
        );
        for (const [name, value] of pairs) expect(merged.get(name)).toBe(value);
      }),
    );
  });

  it("names each cookie once and never carries a line break or NUL", () => {
    fc.assert(
      fc.property(fc.string(), setCookieHeaders, (cookieHeader, setCookies) => {
        const merged = mergeHandshakeCookies(cookieHeader, setCookies);
        expect(merged).not.toMatch(/[\r\n\0]/);
        const names = merged === "" ? [] : merged.split("; ").map((pair) => pair.slice(0, pair.indexOf("=")));
        expect(new Set(names).size).toBe(names.length);
      }),
    );
  });

  it("is idempotent: merging the same handshake twice changes nothing more", () => {
    fc.assert(
      fc.property(cookiePairs, setCookieHeaders, (pairs, setCookies) => {
        const once = mergeHandshakeCookies(
          pairs.map(([name, value]) => `${name}=${value}`).join("; "),
          setCookies,
        );
        expect(mergeHandshakeCookies(once, setCookies)).toBe(once);
      }),
    );
  });

  it("adds the handshake's cookies that the caller did not send", () => {
    fc.assert(
      fc.property(cookiePairs, cookiePairs, (sent, handshake) => {
        const merged = readHeader(
          mergeHandshakeCookies(
            sent.map(([name, value]) => `${name}=${value}`).join("; "),
            handshake.map(([name, value]) => `${name}=${value}; Path=/`),
          ),
        );
        const sentNames = new Set(sent.map(([name]) => name));
        for (const [name, value] of handshake) if (!sentNames.has(name)) expect(merged.get(name)).toBe(value);
      }),
    );
  });
});
