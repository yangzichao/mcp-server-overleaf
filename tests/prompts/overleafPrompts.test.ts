import { describe, expect, it } from "vitest";

import type { PromptToolGroups } from "../../src/prompts/overleafPrompt.js";
import { OVERLEAF_PROMPTS } from "../../src/prompts/registerOverleafPrompts.js";

const GIT_TOOLS = [
  "list_projects",
  "read_project",
  "read_file",
  "search_project",
  "read_history",
  "check_references",
  "look_up_citations",
  "edit_file",
  "manage_files",
  "push_changes",
  "compile_project",
];
const COOKIE_TOOLS = [
  "list_projects",
  "read_project",
  "read_file",
  "edit_file",
  "compile_project",
  "read_review",
  "manage_tracked_changes",
  "manage_comments",
  "manage_project",
];
/** Action and view names the prompts mention, and the one external command with an underscore. */
const OTHER_SNAKE_CASE_WORDS = [
  "replace_text",
  "replace_section",
  "discard_local_changes",
  "download_zip",
  "arxiv_latex_cleaner",
  "keep_bib",
];

const CONFIGURATIONS: ReadonlyArray<[string, PromptToolGroups, readonly string[]]> = [
  ["Git only", { gitBridge: true, sessionCookie: false }, GIT_TOOLS],
  ["cookie only", { gitBridge: false, sessionCookie: true }, COOKIE_TOOLS],
  ["both", { gitBridge: true, sessionCookie: true }, [...new Set([...GIT_TOOLS, ...COOKIE_TOOLS])]],
];

describe.each(CONFIGURATIONS)("prompts offered with %s", (_label, groups, toolNames) => {
  const offered = OVERLEAF_PROMPTS.filter((prompt) => prompt.isOffered(groups));
  const known = new Set([...toolNames, ...OTHER_SNAKE_CASE_WORDS]);

  it.each(offered.map((prompt) => [prompt.name, prompt] as const))(
    "%s names only tools this configuration offers",
    (_name, prompt) => {
      const text = prompt.buildText({ sectionTitle: "Introduction" }, groups);
      for (const word of text.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? []) {
        expect(known, `${prompt.name} names ${word}`).toContain(word);
      }
    },
  );
});

describe("the prompts", () => {
  it("leave out the cookie workflow without a cookie and the push workflow without Git", () => {
    const gitOnly = OVERLEAF_PROMPTS.filter((prompt) =>
      prompt.isOffered({ gitBridge: true, sessionCookie: false }),
    );
    const cookieOnly = OVERLEAF_PROMPTS.filter((prompt) =>
      prompt.isOffered({ gitBridge: false, sessionCookie: true }),
    );
    expect(gitOnly.map((prompt) => prompt.name)).not.toContain("address_review_comments");
    expect(cookieOnly.map((prompt) => prompt.name)).not.toContain("resolve_push_conflict");
  });

  it("put the named project into every tool call", () => {
    for (const prompt of OVERLEAF_PROMPTS) {
      const text = prompt.buildText(
        { project: "https://www.overleaf.com/project/64a1b2c3d4e5f6a7b8c9d0e1", sectionTitle: "Method" },
        { gitBridge: true, sessionCookie: true },
      );
      expect(text, prompt.name).toContain(
        'project: "https://www.overleaf.com/project/64a1b2c3d4e5f6a7b8c9d0e1"',
      );
    }
  });

  it("have unique names and argument schemas that accept no arguments where none are required", () => {
    expect(new Set(OVERLEAF_PROMPTS.map((prompt) => prompt.name)).size).toBe(OVERLEAF_PROMPTS.length);
    for (const prompt of OVERLEAF_PROMPTS) {
      const parsed = prompt.argumentsSchema.safeParse(
        prompt.name === "revise_section" ? { sectionTitle: "x" } : {},
      );
      expect(parsed.success, prompt.name).toBe(true);
    }
  });
});
