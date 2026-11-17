import { afterEach, beforeEach } from "vitest";

import { FakeOverleafRealtime } from "../fakeOverleafRealtime.js";
import { FakeOverleafRemote } from "../fakeOverleafRemote.js";
import { McpStdioClient } from "../mcpStdioClient.js";

/**
 * The review tools need both fakes at once: the Git bridge the server always talks to, and
 * the editor (real-time socket plus web routes) the review tools talk to.
 */

export const PAPER = "\\documentclass{article}\n\\begin{document}\nHello world.\n\\end{document}";

export const REVIEW_TOOL_NAMES = [
  "list_tracked_changes",
  "suggest_edit",
  "list_comments",
  "add_comment",
  "reply_to_comment",
  "resolve_comment",
  "delete_comment",
  "accept_tracked_changes",
  "reject_tracked_changes",
];

export class ReviewTestHarness {
  private currentGitRemote: FakeOverleafRemote | undefined;
  private currentEditor: FakeOverleafRealtime | undefined;
  private currentMainDocumentId: string | undefined;
  private readonly clients: McpStdioClient[] = [];

  get gitRemote(): FakeOverleafRemote {
    if (!this.currentGitRemote) throw new Error("The harness is not set up.");
    return this.currentGitRemote;
  }

  get editor(): FakeOverleafRealtime {
    if (!this.currentEditor) throw new Error("The harness is not set up.");
    return this.currentEditor;
  }

  get mainDocumentId(): string {
    if (!this.currentMainDocumentId) throw new Error("The harness is not set up.");
    return this.currentMainDocumentId;
  }

  async setUp(): Promise<void> {
    this.currentGitRemote = await FakeOverleafRemote.create();
    await this.currentGitRemote.collaboratorPushes("main.tex", PAPER, "Initial draft");
    this.currentEditor = await FakeOverleafRealtime.start(this.currentGitRemote.projectId);
    this.currentMainDocumentId = this.currentEditor.addDocument("main.tex", PAPER);
  }

  async tearDown(): Promise<void> {
    await Promise.all(this.clients.splice(0).map((client) => client.stop()));
    await this.currentEditor?.stop();
    this.currentGitRemote?.cleanUp();
  }

  reviewEnvironment(): NodeJS.ProcessEnv {
    return {
      ...this.gitRemote.environment(),
      OVERLEAF_SESSION_COOKIE: this.editor.cookieHeader,
      OVERLEAF_WEB_BASE_URL: this.editor.baseUrl,
    };
  }

  async startClient(environment: NodeJS.ProcessEnv = this.reviewEnvironment()): Promise<McpStdioClient> {
    const client = await McpStdioClient.start(environment);
    this.clients.push(client);
    return client;
  }

  /** Character offset of a snippet in a document, as Overleaf counts it. */
  offsetOf(documentId: string, snippet: string): number {
    const offset = this.editor.documentText(documentId).indexOf(snippet);
    if (offset === -1) throw new Error(`"${snippet}" is not in the document.`);
    return offset;
  }
}

/** A harness set up before and torn down after every test in the calling file. */
export function useReviewTestHarness(): ReviewTestHarness {
  const harness = new ReviewTestHarness();
  beforeEach(() => harness.setUp());
  afterEach(() => harness.tearDown());
  return harness;
}
