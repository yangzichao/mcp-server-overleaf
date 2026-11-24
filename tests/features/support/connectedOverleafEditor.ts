import type { FakeOverleafAccount } from "../../integration/fakeOverleafAccount.js";
import type {
  FakeOverleafRealtime,
  FakePermissionsLevel,
  FakeTrackedChange,
} from "../../integration/fakeOverleafRealtime.js";
import type { FakeOverleafWeb } from "../../integration/fakeOverleafWeb.js";
import type { McpClientOptions, McpStdioClient } from "../../integration/mcpStdioClient.js";
import { EditorTestHarness, PAPER } from "../../integration/support/editorTestHarness.js";
import { type McpContentBlock, responseText } from "../../integration/support/mcpProtocol.js";
import { environmentForCredentials, type ServerCredentials } from "./serverCredentials.js";
import { TemporaryDownloadFolder } from "./temporaryDownloadFolder.js";

export const editorPaper = PAPER;

export interface ToolReply {
  readonly text: string;
  readonly isError: boolean;
  readonly content: readonly McpContentBlock[];
}

export class ConnectedOverleafEditor {
  private latestReply: ToolReply | undefined;
  private readonly addedDocumentIds = new Map<string, string>();

  private constructor(
    private readonly harness: EditorTestHarness,
    private readonly environment: NodeJS.ProcessEnv,
    private currentClient: McpStdioClient,
    readonly downloadFolder: TemporaryDownloadFolder,
  ) {}

  static async open(
    credentials: ServerCredentials = "a Git token and a session cookie",
    environmentOverrides: NodeJS.ProcessEnv = {},
    clientOptions: McpClientOptions = {},
  ): Promise<ConnectedOverleafEditor> {
    const harness = new EditorTestHarness();
    await harness.setUp();
    try {
      const environment = { ...environmentForCredentials(harness, credentials), ...environmentOverrides };
      const client = await harness.startClient(environment, clientOptions);
      return new ConnectedOverleafEditor(harness, environment, client, TemporaryDownloadFolder.create());
    } catch (error) {
      await harness.tearDown();
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.harness.tearDown();
    this.downloadFolder.remove();
  }

  get client(): McpStdioClient {
    return this.currentClient;
  }

  async switchClient(clientOptions: McpClientOptions): Promise<void> {
    await this.currentClient.stop();
    this.currentClient = await this.harness.startClient(this.environment, clientOptions);
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

  changeIdInMainDocument(kind: "insertion" | "deletion"): string {
    const change = this.trackedChangesIn("main.tex").find((candidate) =>
      kind === "insertion" ? candidate.op.i !== undefined : candidate.op.d !== undefined,
    );
    if (!change) throw new Error(`main.tex has no suggested ${kind}.`);
    return change.id;
  }
}
