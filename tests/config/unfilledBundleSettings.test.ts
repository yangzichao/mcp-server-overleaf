import { describe, expect, it } from "vitest";

import { dropUnfilledBundleSettings } from "../../src/config/unfilledBundleSettings.js";

describe("dropUnfilledBundleSettings", () => {
  it("removes a variable still holding Claude Desktop's placeholder, and keeps real values", () => {
    const environment: NodeJS.ProcessEnv = {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the literal MCPB placeholder under test
      OVERLEAF_GIT_TOKEN: "${user_config.overleaf_git_token}",
      OVERLEAF_SESSION_COOKIE: "overleaf_session2=s%3Areal",
      PATH: "/usr/bin",
    };
    dropUnfilledBundleSettings(environment);
    expect(environment).toEqual({ OVERLEAF_SESSION_COOKIE: "overleaf_session2=s%3Areal", PATH: "/usr/bin" });
  });

  it("leaves a value that only contains a placeholder among other text", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the literal MCPB placeholder under test
    const environment: NodeJS.ProcessEnv = { OVERLEAF_GIT_TOKEN: "olp_${user_config.x}" };
    dropUnfilledBundleSettings(environment);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the literal MCPB placeholder under test
    expect(environment.OVERLEAF_GIT_TOKEN).toBe("olp_${user_config.x}");
  });
});
