import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { dropUnfilledBundleSettings } from "../../../src/config/unfilledBundleSettings.js";

const settingKey = fc.stringMatching(/^[A-Za-z0-9_]{1,12}$/);
const placeholder = fc
  .tuple(settingKey, fc.constantFrom("", " ", "\t", "\n"), fc.constantFrom("", " ", "\n"))
  .map(([key, before, after]) => `${before}\${user_config.${key}}${after}`);
const filledValue = fc.oneof(
  fc.string({ maxLength: 20 }),
  settingKey.map((key) => `\${user_config.${key}}x`),
  settingKey.map((key) => `x\${user_config.${key}}`),
  settingKey.map((key) => `\${user_config.${key}-}`),
  settingKey.map((key) => `\${user_config.${key}} \${user_config.${key}}`),
  fc.constantFrom(`\${user_config.}`, `\${user_config}`, "$user_config.TOKEN", "{user_config.TOKEN}"),
);

const taggedSettings = fc.dictionary(
  fc.stringMatching(/^[A-Z_]{1,10}$/),
  fc.oneof(
    placeholder.map((value) => ({ value, unfilled: true })),
    filledValue.map((value) => ({ value, unfilled: false })),
  ),
  { maxKeys: 8 },
);
const environment = taggedSettings.map((settings) =>
  Object.fromEntries(Object.entries(settings).map(([name, { value }]) => [name, value])),
);

describe("dropUnfilledBundleSettings properties", () => {
  it("drops exactly the settings still holding their placeholder, and leaves every other value as it was", () => {
    fc.assert(
      fc.property(taggedSettings, (settings) => {
        const processEnvironment: NodeJS.ProcessEnv = Object.fromEntries(
          Object.entries(settings).map(([name, { value }]) => [name, value]),
        );
        dropUnfilledBundleSettings(processEnvironment);
        const expected = Object.fromEntries(
          Object.entries(settings).flatMap(([name, { value, unfilled }]) =>
            unfilled ? [] : [[name, value]],
          ),
        );
        expect(processEnvironment).toEqual(expected);
      }),
    );
  });

  it("is idempotent", () => {
    fc.assert(
      fc.property(environment, (written) => {
        const once: NodeJS.ProcessEnv = { ...written };
        dropUnfilledBundleSettings(once);
        const twice: NodeJS.ProcessEnv = { ...once };
        dropUnfilledBundleSettings(twice);
        expect(twice).toEqual(once);
      }),
    );
  });
});
