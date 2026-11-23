import type { FakeOverleafAccount } from "../../integration/fakeOverleafAccount.js";
import type {
  FakeOverleafRealtime,
  FakePermissionsLevel,
  FakeTrackedChange,
} from "../../integration/fakeOverleafRealtime.js";
import type { FakeOverleafWeb } from "../../integration/fakeOverleafWeb.js";
import type { McpStdioClient } from "../../integration/mcpStdioClient.js";
import { EditorTestHarness, PAPER } from "../../integration/support/editorTestHarness.js";
import { type McpContentBlock, responseText } from "../../integration/support/mcpProtocol.js";
import { environmentForCredentials, type ServerCredentials } from "./serverCredentials.js";
import { TemporaryDownloadFolder } from "./temporaryDownloadFolder.js";

/** The paper every scenario finds open in Overleaf's editor. Its third line is "Hello world.". */
export const editorPaper = PAPER;

/** A collaborator's account id, as the realtime fake records it on their suggestions. */
export const COLLABORATOR_USER_ID = "6500000000000000000000bb";

export interface ToolReply {
  readonly text: string;
  readonly isError: boolean;
  /** Every block of the reply; `text` leaves out the images. */
  readonly content: readonly McpContentBlock[];
}

/**
 * The world one scenario runs in when the tools reach Overleaf through a session cookie: a fake
 * Overleaf editor and web application holding the paper, a fake Git bridge beside them, and an
 * MCP client speaking to the compiled server over stdio.
 *
 * Every scenario opens its own, because almost every scenario changes what Overleaf holds.
 */
export class ConnectedOverleafEditor {
  private latestReply: ToolReply | undefined;
  private readonly addedDocumentIds = new Map<string, string>();

  private constructor(
    private readonly harness: EditorTestHarness,
    readonly client: McpStdioClient,
    readonly downloadFolder: TemporaryDownloadFolder,
  ) {}

  static async open(
    credentials: ServerCredentials = "a Git token and a session cookie",
  ): Promise<ConnectedOverleafEditor> {
    const harness = new EditorTestHarness();
    await harness.setUp();
    try {
      const client = await harness.startClient(environmentForCredentials(harness, credentials));
      return new ConnectedOverleafEditor(harness, client, TemporaryDownloadFolder.create());
    } catch (error) {
      await harness.tearDown();
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.harness.tearDown();
    this.downloadFolder.remove();
  }

  get editor(): FakeOverleafRealtime {
    return this.harness.editor;
  }

  get web(): FakeOverleafWeb {
    return this.harness.editor.web;
  }

  get account(): FakeOverleafAccount {
    return this.harness.editor.web.account;
  }

  get projectId(): string {
    return this.harness.editor.projectId;
  }

  /** The server's workspace, which holds its clones and, under .build, its compile outputs. */
  get workspaceDirectory(): string {
    return this.harness.gitRemote.workspaceDirectory;
  }

  get mainDocumentId(): string {
    return this.harness.mainDocumentId;
  }

  get lastReply(): ToolReply {
    if (!this.latestReply) throw new Error("No tool has been called in this scenario yet.");
    return this.latestReply;
  }

  async callTool(toolName: string, toolArguments: Record<string, unknown> = {}): Promise<ToolReply> {
    const response = await this.client.callRaw(toolName, toolArguments);
    this.latestReply = {
      text: responseText(response),
      isError: response.result?.isError === true,
      content: response.result?.content ?? [],
    };
    return this.latestReply;
  }

  setAccessLevel(level: FakePermissionsLevel): void {
    this.harness.editor.permissionsLevel = level;
  }

  addDocument(path: string, text: string): void {
    this.addedDocumentIds.set(path, this.harness.editor.addDocument(path, text));
  }

  documentIdOf(path: string): string {
    if (path === "main.tex") return this.mainDocumentId;
    const documentId = this.addedDocumentIds.get(path);
    if (!documentId) throw new Error(`The scenario never added "${path}".`);
    return documentId;
  }

  textOf(path: string): string {
    return this.harness.editor.documentText(this.documentIdOf(path));
  }

  trackedChangesIn(path: string): readonly FakeTrackedChange[] {
    return this.harness.editor.trackedChanges(this.documentIdOf(path));
  }

  offsetInMainDocument(snippet: string): number {
    return this.harness.offsetOf(this.mainDocumentId, snippet);
  }

  /** The id of the one pending suggestion of this kind in main.tex. */
  changeIdOf(kind: "insertion" | "deletion"): string {
    const change = this.trackedChangesIn("main.tex").find((candidate) =>
      kind === "insertion" ? candidate.op.i !== undefined : candidate.op.d !== undefined,
    );
    if (!change) throw new Error(`main.tex has no suggested ${kind}.`);
    return change.id;
  }
}
