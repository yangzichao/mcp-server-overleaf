import { FakeOverleafRemote } from "../../integration/fakeOverleafRemote.js";
import { McpStdioClient } from "../../integration/mcpStdioClient.js";

/** The paper every scenario finds already published, written by the co-author. */
export const publishedPaper = [
  "\\documentclass{article}",
  "\\begin{document}",
  "\\section{Introduction}",
  "The sample size is 5000.",
  "\\section{Conclusion}",
  "Placeholder.",
  "\\end{document}",
].join("\n");

/** A second published file, so scenarios about removing and renaming have something real to move. */
export const publishedNotes = "Shared notes the co-author keeps.\n";

/**
 * The world one scenario runs in: a fake Overleaf remote holding the co-author's work, and
 * an MCP client speaking to the compiled server over stdio the way a real client does.
 *
 * Every scenario opens its own. Most of them publish to the remote, and a commit left behind
 * by an earlier scenario would let a later one pass for the wrong reason.
 */
export class ConnectedOverleafProject {
  private constructor(
    readonly remote: FakeOverleafRemote,
    readonly client: McpStdioClient,
  ) {}

  static async open(): Promise<ConnectedOverleafProject> {
    const remote = await FakeOverleafRemote.create();
    await remote.collaboratorPushes("main.tex", publishedPaper, "Initial draft");
    await remote.collaboratorPushes("notes.tex", publishedNotes, "Add the shared notes");
    return new ConnectedOverleafProject(remote, await McpStdioClient.start(remote.environment()));
  }

  async close(): Promise<void> {
    await this.client.stop();
    this.remote.cleanUp();
  }
}
