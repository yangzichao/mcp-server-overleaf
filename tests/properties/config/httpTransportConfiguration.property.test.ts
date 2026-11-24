import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { ConfigurationError } from "../../../src/config/configurationError.js";
import { loadHttpTransportConfiguration } from "../../../src/config/httpTransportConfiguration.js";

const blank = fc.constantFrom("", " ", "\t", "\n ");
const maybeText = (text: fc.Arbitrary<string>) => fc.option(fc.oneof(text, blank), { nil: undefined });

const environment = fc.record({
  OVERLEAF_MCP_HTTP_AUTH_TOKEN: maybeText(fc.stringMatching(/^[A-Za-z0-9]{1,12}$/)),
  OVERLEAF_MCP_HTTP_PORT: maybeText(
    fc.oneof(
      fc.integer({ min: -10, max: 70_000 }).map(String),
      fc.constantFrom("abc", "1e3", "0x10", "3017.5", "65535", "65536", "0"),
    ),
  ),
  OVERLEAF_MCP_HTTP_HOST: maybeText(fc.constantFrom("127.0.0.1", "::1", "0.0.0.0", "localhost")),
});
const overrides = fc.record(
  {
    port: fc.oneof(fc.integer({ min: -10, max: 70_000 }), fc.double({ noNaN: false })),
    host: fc.oneof(fc.constantFrom("127.0.0.1", "example.local"), blank),
    allowAnonymous: fc.boolean(),
  },
  { requiredKeys: [] },
);

describe("loadHttpTransportConfiguration properties", () => {
  it("binds a named host on a port from 1 to 65535 behind the trimmed token, or refuses with a ConfigurationError", () => {
    fc.assert(
      fc.property(overrides, environment, (given, written) => {
        let configuration: ReturnType<typeof loadHttpTransportConfiguration>;
        try {
          configuration = loadHttpTransportConfiguration(given, written);
        } catch (error) {
          expect(error).toBeInstanceOf(ConfigurationError);
          return;
        }
        expect(configuration.host.trim()).not.toBe("");
        expect(configuration.host).toBe(configuration.host.trim());
        expect(Number.isInteger(configuration.port)).toBe(true);
        expect(configuration.port).toBeGreaterThanOrEqual(1);
        expect(configuration.port).toBeLessThanOrEqual(65_535);
        expect(configuration.bearerToken).toBe(written.OVERLEAF_MCP_HTTP_AUTH_TOKEN?.trim() || null);
      }),
    );
  });

  it("never starts without a token unless anonymous access was asked for", () => {
    fc.assert(
      fc.property(overrides, environment, (given, written) => {
        const hasToken = Boolean(written.OVERLEAF_MCP_HTTP_AUTH_TOKEN?.trim());
        fc.pre(!hasToken && !given.allowAnonymous);
        expect(() => loadHttpTransportConfiguration(given, written)).toThrow(ConfigurationError);
      }),
    );
  });
});
