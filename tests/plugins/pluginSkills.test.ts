import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// @ts-expect-error - build tooling is plain JavaScript, deliberately outside the TypeScript program.
import { pluginName } from "../../scripts/plugins/renderSharedMcpServers.mjs";

/**
 * Claude Code and Codex both load `skills/<name>/SKILL.md` from the plugin, and both read only
 * the frontmatter until a skill is chosen, so a skill with a malformed header is never offered.
 * The limits are the Agent Skills ones: a lowercase hyphenated name of at most 64 characters
 * that matches its folder, and a description of at most 1,024.
 */

const skillsDirectory = new URL(`../../plugins/${pluginName}/skills/`, import.meta.url);
const skillNames = readdirSync(skillsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

function readFrontmatter(skillName: string): { fields: Map<string, string>; body: string } {
  const text = readFileSync(new URL(`${skillName}/SKILL.md`, skillsDirectory), "utf8");
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!match?.[1] || match[2] === undefined) throw new Error(`${skillName}/SKILL.md has no frontmatter.`);
  const fields = new Map<string, string>();
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    if (separator > 0) fields.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return { fields, body: match[2] };
}

describe("the plugin's skills", () => {
  it("ships some", () => {
    expect(skillNames.length).toBeGreaterThan(0);
  });

  it.each(skillNames)("%s has a valid header and a body", (skillName) => {
    const { fields, body } = readFrontmatter(skillName);
    expect(fields.get("name")).toBe(skillName);
    expect(skillName).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(skillName.length).toBeLessThanOrEqual(64);
    const description = fields.get("description") ?? "";
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(1024);
    expect(body.trim().length).toBeGreaterThan(0);
  });
});
