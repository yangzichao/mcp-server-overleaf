import { describe, expect, it } from "vitest";

import { dropUnfilledBundleSettings } from "../../src/config/unfilledBundleSettings.js";
import { unfilledBundlePlaceholder } from "../support/bundlePlaceholder.js";

describe("dropUnfilledBundleSettings", () => {
  it("removes a variable still holding Claude Desktop's placeholder, and keeps real values", () => {
    const environment: NodeJS.ProcessEnv = {
      OVERLEAF_GIT_TOKEN: unfilledBundlePlaceholder("overleaf_git_token"),
      OVERLEAF_SESSION_COOKIE: "overleaf_session2=s%3Areal",
      PATH: "/usr/bin",
    };
    dropUnfilledBundleSettings(environment);
    expect(environment).toEqual({ OVERLEAF_SESSION_COOKIE: "overleaf_session2=s%3Areal", PATH: "/usr/bin" });
  });

  it("leaves a value that only contains a placeholder among other text", () => {
    const tokenAroundPlaceholder = `olp_${unfilledBundlePlaceholder("x")}`;
    const environment: NodeJS.ProcessEnv = { OVERLEAF_GIT_TOKEN: tokenAroundPlaceholder };
    dropUnfilledBundleSettings(environment);
    expect(environment.OVERLEAF_GIT_TOKEN).toBe(tokenAroundPlaceholder);
  });
});
