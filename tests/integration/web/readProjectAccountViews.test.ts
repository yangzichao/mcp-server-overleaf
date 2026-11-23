import { describe, expect, it } from "vitest";

import { useEditorTestHarness } from "../support/editorTestHarness.js";

/**
 * read_project's members and word_count views, which only the session cookie can serve, and the
 * cookie-only read_project's settings lines and outline, read from Overleaf's editor.
 */

const NOT_LISTED_NOTE =
  "Anyone who joined through a sharing link is not listed; Overleaf's Share menu shows them, and sharing is changed there, not through this server.";

describe("read_project's account views", () => {
  const harness = useEditorTestHarness();

  function cookieOnlyEnvironment(): NodeJS.ProcessEnv {
    return {
      OVERLEAF_SESSION_COOKIE: harness.editor.cookieHeader,
      OVERLEAF_WEB_BASE_URL: harness.editor.baseUrl,
      OVERLEAF_MCP_WORKSPACE_DIR: harness.gitRemote.workspaceDirectory,
      XDG_CONFIG_HOME: harness.gitRemote.workspaceDirectory,
      OVERLEAF_PROJECTS: `paper=${harness.gitRemote.projectId}`,
    };
  }

  async function listedViews(environment: NodeJS.ProcessEnv): Promise<unknown> {
    const client = await harness.startClient(environment);
    const tool = (await client.listTools()).find((candidate) => candidate.name === "read_project");
    return (tool?.inputSchema.properties?.view as { enum?: unknown } | undefined)?.enum;
  }

  it("lists members only where the session cookie can serve it, and word_count everywhere", async () => {
    expect(await listedViews(harness.gitRemote.environment())).toEqual([
      "overview",
      "files",
      "outline",
      "status",
      "changes",
      "word_count",
    ]);
    expect(await listedViews(harness.reviewEnvironment())).toEqual([
      "overview",
      "files",
      "outline",
      "status",
      "changes",
      "members",
      "word_count",
    ]);
    expect(await listedViews(cookieOnlyEnvironment())).toEqual([
      "overview",
      "files",
      "outline",
      "members",
      "word_count",
    ]);
  });

  it("refuses the account views on a server with only a Git token", async () => {
    const client = await harness.startClient(harness.gitRemote.environment());
    expect(await client.call("read_project", { view: "members" })).toContain("Input validation error");
  });

  it("shows the owner, the collaborators with their access, and the pending invitations to the owner", async () => {
    const client = await harness.startClient();
    expect(await client.call("read_project", { view: "members" })).toBe(
      [
        'Members of "Fake paper":',
        "Owner: You Example <you@example.com> (this account)",
        "Collaborators (2):",
        "- Ada Example <ada@example.com> — can edit",
        "- Bea Example <bea@example.com> — can review",
        "Pending invitations (1):",
        "- invited.coauthor@example.com — can edit",
        NOT_LISTED_NOTE,
      ].join("\n"),
    );
  });

  it("names someone else as owner, and does not ask for invitations Overleaf shows only the owner", async () => {
    harness.editor.permissionsLevel = "readAndWrite";
    const client = await harness.startClient();
    expect(await client.call("read_project", { view: "members" })).toBe(
      [
        'Members of "Fake paper":',
        "Owner: Olga Example <olga@example.com>",
        "Collaborators (3):",
        "- You Example <you@example.com> — can edit",
        "- Ada Example <ada@example.com> — can edit",
        "- Bea Example <bea@example.com> — can review",
        "Pending invitations: Overleaf shows them only to the project's owner, and this account is not the owner.",
        NOT_LISTED_NOTE,
      ].join("\n"),
    );
    expect(harness.editor.web.requests.filter((request) => request.path.endsWith("/invites"))).toEqual([]);
  });

  it("gives Overleaf's word count for the main document, or for one document", async () => {
    harness.editor.addDocument("chapter.tex", "\\section{Results}\nSome words.");
    const client = await harness.startClient();
    expect(await client.call("read_project", { view: "word_count" })).toBe(
      [
        "Overleaf's word count for main.tex, the main document:",
        "Words in text: 1204",
        "Words in headings: 17",
        "Words outside text (captions and the like): 42",
        "Headings: 6",
        "Floats (figures, tables and the like): 3",
        "Inline math: 25",
        "Displayed math: 4",
      ].join("\n"),
    );
    expect(harness.editor.web.settings.wordCountQueries[0]?.get("file")).toBeNull();

    const chapter = await client.call("read_project", { view: "word_count", path: "chapter.tex" });
    expect(chapter.split("\n")[0]).toBe("Overleaf's word count for chapter.tex:");
    expect(harness.editor.web.settings.wordCountQueries[1]?.get("file")).toBe("chapter.tex");
  });

  it("refuses to count a document that does not exist, naming the ones that do", async () => {
    const client = await harness.startClient();
    expect(await client.call("read_project", { view: "word_count", path: "missing.tex" })).toBe(
      'No editable document at "missing.tex" in this project. Editable documents: main.tex.',
    );
    expect(harness.editor.web.settings.wordCountQueries).toHaveLength(0);
  });

  it("refuses an argument the view does not take", async () => {
    const client = await harness.startClient();
    expect(await client.call("read_project", { view: "word_count", followIncludes: false })).toBe(
      "followIncludes does not apply to word_count; outline uses it.",
    );
    expect(await client.call("read_project", { view: "members", path: "main.tex" })).toBe(
      "path does not apply to members; outline, changes and word_count use it.",
    );
  });
});

describe("read_project without a Git token", () => {
  const harness = useEditorTestHarness();

  function cookieOnlyEnvironment(): NodeJS.ProcessEnv {
    return {
      OVERLEAF_SESSION_COOKIE: harness.editor.cookieHeader,
      OVERLEAF_WEB_BASE_URL: harness.editor.baseUrl,
      OVERLEAF_MCP_WORKSPACE_DIR: harness.gitRemote.workspaceDirectory,
      XDG_CONFIG_HOME: harness.gitRemote.workspaceDirectory,
      OVERLEAF_PROJECTS: `paper=${harness.gitRemote.projectId}`,
    };
  }

  it("shows the compiler, TeX Live image, spell check and track changes in the overview", async () => {
    const client = await harness.startClient(cookieOnlyEnvironment());
    const overview = await client.call("read_project");
    expect(overview).toContain("Compiler: pdflatex. TeX Live image: texlive-full:2025.1. Spell check: en.");
    expect(overview).toContain("Track changes: off.");
  });

  it("outlines the main document Overleaf's menu names, across the files it includes", async () => {
    const thesisId = harness.editor.addDocument(
      "thesis.tex",
      "\\documentclass{book}\n\\begin{document}\n\\chapter{Start}\n\\input{chapters/intro}\n\\end{document}\n",
    );
    harness.editor.addDocument(
      "chapters/intro.tex",
      "\\section{Introduction}\nText.\n\\section{Method}\nMore text.\n",
    );
    harness.editor.rootDocumentId = thesisId;
    const client = await harness.startClient(cookieOnlyEnvironment());

    const whole = await client.call("read_project", { view: "outline" });
    expect(whole).toBe(
      [
        "Outline of thesis.tex, the main document set in Overleaf's menu:",
        "  \\chapter{Start}  [thesis.tex lines 3-4]",
        "    \\section{Introduction}  [chapters/intro.tex lines 1-2]",
        "    \\section{Method}  [chapters/intro.tex lines 3-5]",
      ].join("\n"),
    );

    const ownHeadings = await client.call("read_project", { view: "outline", followIncludes: false });
    expect(ownHeadings).toBe(
      "Outline of thesis.tex, the main document set in Overleaf's menu:\n  \\chapter{Start}  [lines 3-4]",
    );

    const oneFile = await client.call("read_project", { view: "outline", path: "chapters/intro.tex" });
    expect(oneFile).toBe(
      [
        "    \\section{Introduction}  [chapters/intro.tex lines 1-2]",
        "    \\section{Method}  [chapters/intro.tex lines 3-5]",
      ].join("\n"),
    );
  });

  it("refuses an argument the view does not take", async () => {
    const client = await harness.startClient(cookieOnlyEnvironment());
    expect(await client.call("read_project", { view: "word_count", followIncludes: true })).toBe(
      "followIncludes does not apply to word_count; outline uses it.",
    );
  });
});
