import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  loadReviewCredentials,
  normaliseSessionCookie,
  reviewCredentialSecrets,
} from "../../src/config/review/reviewCredentials.js";

describe("reading a session cookie the way someone actually copies it", () => {
  it("accepts a single name=value pair", () => {
    expect(normaliseSessionCookie("overleaf_session2=s%3Aabc.def")).toBe("overleaf_session2=s%3Aabc.def");
  });

  it("picks the session cookie out of a whole document.cookie string", () => {
    expect(normaliseSessionCookie("_ga=GA1.1.5; overleaf_session2=s%3Aabc.def; GCLB=xyz")).toBe(
      "overleaf_session2=s%3Aabc.def",
    );
  });

  it("accepts a self-hosted installation's cookie name", () => {
    expect(normaliseSessionCookie("sharelatex.sid=s%3Aabc.def")).toBe("sharelatex.sid=s%3Aabc.def");
  });

  it("gives a bare value the overleaf.com cookie name, since that is the only name it can have", () => {
    expect(normaliseSessionCookie("s%3Aabc.def")).toBe("overleaf_session2=s%3Aabc.def");
  });

  it("tolerates a trailing semicolon and surrounding whitespace", () => {
    expect(normaliseSessionCookie("  overleaf_session2=s%3Aabc.def;  ")).toBe(
      "overleaf_session2=s%3Aabc.def",
    );
  });

  it("says which cookie is wanted when the string holds other cookies only", () => {
    expect(() => normaliseSessionCookie("_ga=GA1.1.5; GCLB=xyz")).toThrow(
      /overleaf_session2 or sharelatex\.sid/,
    );
  });

  it("refuses an empty cookie", () => {
    expect(() => normaliseSessionCookie("   ")).toThrow(/empty/i);
  });

  it("refuses a cookie with a newline, which would let a header be forged", () => {
    expect(() => normaliseSessionCookie("overleaf_session2=abc\nX-Evil: 1")).toThrow(/single line/i);
  });
});

describe("loading the review credentials from the environment", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "overleaf-mcp-cookie-"));
  });
  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("is absent when nothing is configured, so the other tools run unchanged", () => {
    expect(loadReviewCredentials({})).toBeUndefined();
  });

  it("defaults to overleaf.com, which is not the Git bridge's host", () => {
    expect(loadReviewCredentials({ OVERLEAF_SESSION_COOKIE: "s%3Aabc" })).toEqual({
      cookieHeader: "overleaf_session2=s%3Aabc",
      webBaseUrl: "https://www.overleaf.com",
    });
  });

  it("takes a self-hosted address and keeps only its origin", () => {
    expect(
      loadReviewCredentials({
        OVERLEAF_SESSION_COOKIE: "sharelatex.sid=s%3Aabc",
        OVERLEAF_WEB_BASE_URL: "https://latex.example.edu/project/123",
      })?.webBaseUrl,
    ).toBe("https://latex.example.edu");
  });

  it("reads the cookie from a file, so it need not sit in a client's configuration", () => {
    const cookieFile = join(directory, "cookie");
    writeFileSync(cookieFile, "overleaf_session2=s%3Afrom-file\n");
    expect(loadReviewCredentials({ OVERLEAF_SESSION_COOKIE_FILE: cookieFile })?.cookieHeader).toBe(
      "overleaf_session2=s%3Afrom-file",
    );
  });

  it("prefers the variable over the file when both are set", () => {
    const cookieFile = join(directory, "cookie");
    writeFileSync(cookieFile, "overleaf_session2=s%3Afrom-file\n");
    expect(
      loadReviewCredentials({
        OVERLEAF_SESSION_COOKIE: "overleaf_session2=s%3Adirect",
        OVERLEAF_SESSION_COOKIE_FILE: cookieFile,
      })?.cookieHeader,
    ).toBe("overleaf_session2=s%3Adirect");
  });

  it("refuses a relative cookie file path", () => {
    expect(() => loadReviewCredentials({ OVERLEAF_SESSION_COOKIE_FILE: "cookie" })).toThrow(/absolute path/i);
  });

  it("says so when the cookie file is not readable", () => {
    expect(() => loadReviewCredentials({ OVERLEAF_SESSION_COOKIE_FILE: join(directory, "missing") })).toThrow(
      /Cannot read an Overleaf session cookie/,
    );
  });

  it("refuses a web address that is not a URL", () => {
    expect(() =>
      loadReviewCredentials({
        OVERLEAF_SESSION_COOKIE: "s%3Aabc",
        OVERLEAF_WEB_BASE_URL: "not a url",
      }),
    ).toThrow(/OVERLEAF_WEB_BASE_URL is not a URL/);
  });
});

describe("keeping the cookie out of anything that leaves the process", () => {
  it("offers both the header and the bare value for redaction", () => {
    const credentials = loadReviewCredentials({ OVERLEAF_SESSION_COOKIE: "s%3Asecret-value.sig" });
    expect(reviewCredentialSecrets(credentials)).toEqual([
      "overleaf_session2=s%3Asecret-value.sig",
      "s%3Asecret-value.sig",
    ]);
  });

  it("offers nothing when no cookie is configured", () => {
    expect(reviewCredentialSecrets(undefined)).toEqual([]);
  });
});
