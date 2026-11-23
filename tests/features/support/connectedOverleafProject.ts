import { join } from "node:path";

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

/** One commit the co-author made before the scenario starts. */
export interface PublishedFile {
  readonly path: string;
  readonly content: string | Buffer;
  readonly commitMessage: string;
}

export interface ProjectWorldOptions {
  readonly publishedFiles: readonly PublishedFile[];
  /** Replaces or adds to the environment the server starts with, after the remote exists. */
  readonly environment?: (remote: FakeOverleafRemote) => NodeJS.ProcessEnv;
  /** Runs against the remote before the server starts, for worlds with more than one paper. */
  readonly prepareRemote?: (remote: FakeOverleafRemote) => Promise<void>;
}

export const defaultPublishedFiles: readonly PublishedFile[] = [
  { path: "main.tex", content: publishedPaper, commitMessage: "Initial draft" },
  { path: "notes.tex", content: publishedNotes, commitMessage: "Add the shared notes" },
];

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
    private currentClient: McpStdioClient,
  ) {}

  get client(): McpStdioClient {
    return this.currentClient;
  }

  static open(): Promise<ConnectedOverleafProject> {
    return ConnectedOverleafProject.openWith({ publishedFiles: defaultPublishedFiles });
  }

  static async openWith(options: ProjectWorldOptions): Promise<ConnectedOverleafProject> {
    const remote = await FakeOverleafRemote.create();
    try {
      for (const file of options.publishedFiles) {
        await remote.collaboratorPushes(file.path, file.content, file.commitMessage);
      }
      await options.prepareRemote?.(remote);
      const environment = { ...remote.environment(), ...options.environment?.(remote) };
      return new ConnectedOverleafProject(remote, await McpStdioClient.start(environment));
    } catch (error) {
      remote.cleanUp();
      throw error;
    }
  }

  /** Where the server keeps its clone of the default project. */
  get cloneDirectory(): string {
    return join(this.remote.workspaceDirectory, this.remote.projectId);
  }

  /** Starts the server again over the same remote and workspace, as a client does after a settings change. */
  async restartServer(environmentOverrides: NodeJS.ProcessEnv): Promise<void> {
    await this.currentClient.stop();
    this.currentClient = await McpStdioClient.start({
      ...this.remote.environment(),
      ...environmentOverrides,
    });
  }

  async close(): Promise<void> {
    await this.client.stop();
    this.remote.cleanUp();
  }
}
