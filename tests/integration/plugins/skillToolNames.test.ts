import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { McpStdioClient } from "../mcpStdioClient.js";
import { namesTheModelCanUse } from "../support/instructionNames.js";

/**
 * A skill names tools, actions and views in prose, so a renamed tool would leave a skill
 * telling the model to call something that does not exist. The server started with no
 * credentials lists all 15 tools with every action and view, the widest surface there is.
 */

const skillsDirectory = new URL("../../../plugins/overleaf/skills/", import.meta.url);
const skillNames = readdirSync(skillsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

/** Words with an underscore that belong to other programs the skills run. */
const EXTERNAL_WORDS = new Set(["arxiv_latex_cleaner", "keep_bib", "resize_images", "im_size"]);

describe("the plugin's skills", () => {
  let isolatedHome: string;
  let usable: Set<string>;

  beforeAll(async () => {
    isolatedHome = mkdtempSync(join(tmpdir(), "overleaf-skill-names-"));
    const emptyEnvironmentFile = join(isolatedHome, "empty.env");
    writeFileSync(emptyEnvironmentFile, "");
    const client = await McpStdioClient.start({
      HOME: isolatedHome,
      XDG_CONFIG_HOME: join(isolatedHome, ".config"),
      OVERLEAF_MCP_ENV_FILE: emptyEnvironmentFile,
      OVERLEAF_MCP_WORKSPACE_DIR: join(isolatedHome, "projects"),
    });
    try {
      usable = namesTheModelCanUse(await client.listTools());
    } finally {
      await client.stop();
    }
  });

  afterAll(() => {
    rmSync(isolatedHome, { recursive: true, force: true });
  });

  it.each(skillNames)("%s names only tools, actions and views the server lists", (skillName) => {
    const text = readFileSync(new URL(`${skillName}/SKILL.md`, skillsDirectory), "utf8");
    for (const word of text.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? []) {
      if (EXTERNAL_WORDS.has(word)) continue;
      expect(usable, `${skillName} names ${word}`).toContain(word);
    }
  });
});
