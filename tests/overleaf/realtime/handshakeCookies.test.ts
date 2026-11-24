import { describe, expect, it } from "vitest";

import { mergeHandshakeCookies } from "../../../src/overleaf/realtime/handshakeCookies.js";

describe("carrying handshake cookies into the WebSocket upgrade", () => {
  it("adds the load balancer's affinity cookie to the session cookie", () => {
    expect(
      mergeHandshakeCookies("overleaf_session2=s%3Aabc", [
        "GCLB=CPm8; path=/; HttpOnly; expires=Wed, 01 Jan 2031",
      ]),
    ).toBe("overleaf_session2=s%3Aabc; GCLB=CPm8");
  });

  it("never lets a handshake response replace a cookie the caller sends", () => {
    expect(mergeHandshakeCookies("overleaf_session2=mine", ["overleaf_session2=theirs; Path=/"])).toBe(
      "overleaf_session2=mine",
    );
  });

  it("returns the caller's cookies unchanged when the handshake sets none", () => {
    expect(mergeHandshakeCookies("a=1; b=2", [])).toBe("a=1; b=2");
  });

  it("drops malformed pairs and anything carrying a line break", () => {
    expect(mergeHandshakeCookies("a=1", ["no-equals-sign", "=nameless", "evil=x\r\nInjected: yes"])).toBe(
      "a=1",
    );
  });
});
