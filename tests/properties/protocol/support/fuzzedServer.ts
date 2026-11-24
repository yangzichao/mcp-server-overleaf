import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { FakeMetadataServices } from "../../../integration/fakeMetadataServices.js";
import { FakeOverleafRealtime } from "../../../integration/fakeOverleafRealtime.js";
import { FakeOverleafRemote } from "../../../integration/fakeOverleafRemote.js";
import { McpStdioClient } from "../../../integration/mcpStdioClient.js";
import type { McpToolDescription } from "../../../integration/support/mcpProtocol.js";
import type { KnownProjectValues } from "./fuzzedArgumentPools.js";
import {
  REGISTERED_DOI,
  SEEDED_CITATION_KEYS,
  SEEDED_FIGURE_PATH,
  SEEDED_SECTION_TITLES,
  SEEDED_TEXT_FILES,
  seedEditor,
  seedGitRemote,
  seedMetadataServices,
  seedSandbox,
} from "./fuzzedProject.js";
import type { ProjectStateSources } from "./projectStateSnapshot.js";

const execFileAsync = promisify(execFile);

export type FuzzedConfiguration = "git-and-cookie" | "cookie-only";

export interface FuzzedServer {
  readonly client: McpStdioClient;
  readonly tools: readonly McpToolDescription[];
  readonly known: KnownProjectValues;
  readonly stateSources: ProjectStateSources;
  stop(): Promise<void>;
}

const ANY_FILE_REVISION = "0".repeat(64);

async function readFileRevisions(client: McpStdioClient): Promise<string[]> {
  const revisions: string[] = [];
  for (const path of Object.keys(SEEDED_TEXT_FILES)) {
    const reply = await client.call("read_file", { project: "paper", path, mode: "full" });
    const { revision } = JSON.parse(reply) as { revision?: unknown };
    if (typeof revision !== "string") throw new Error(`read_file gave no revision for ${path}:\n${reply}`);
    revisions.push(revision);
  }
  return revisions;
}

async function readCommitHashes(bareRepositoryDirectory: string): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["log", "--format=%H", "main"], {
    cwd: bareRepositoryDirectory,
  });
  return stdout.split("\n").filter(Boolean);
}

async function readClonePath(client: McpStdioClient): Promise<string> {
  const overview = await client.call("read_project", { project: "paper" });
  const firstLine = overview.split("\n")[0] ?? "";
  if (!firstLine.startsWith("Local clone: ")) throw new Error(`No clone path in the overview:\n${overview}`);
  return firstLine.slice("Local clone: ".length);
}

export async function startFuzzedServer(configuration: FuzzedConfiguration): Promise<FuzzedServer> {
  const remote = await FakeOverleafRemote.create();
  await seedGitRemote(remote);
  const editor = await FakeOverleafRealtime.start(remote.projectId);
  const editorValues = seedEditor(editor);
  const metadata = await FakeMetadataServices.start();
  seedMetadataServices(metadata);
  const sandboxDirectory = await mkdtemp(join(tmpdir(), "overleaf-fuzz-sandbox-"));
  const sandbox = await seedSandbox(sandboxDirectory);

  const cookieEnvironment = {
    OVERLEAF_SESSION_COOKIE: editor.cookieHeader,
    OVERLEAF_WEB_BASE_URL: editor.baseUrl,
  };
  const credentials =
    configuration === "git-and-cookie"
      ? { ...remote.environment(), ...cookieEnvironment }
      : {
          ...cookieEnvironment,
          OVERLEAF_PROJECTS: `paper=${remote.projectId}`,
          OVERLEAF_MCP_WORKSPACE_DIR: remote.workspaceDirectory,
        };
  const client = await McpStdioClient.start({
    ...credentials,
    ...metadata.environment(),
    OVERLEAF_MCP_ENV_FILE: sandbox.environmentFileWithNoCredentials,
    XDG_CONFIG_HOME: sandboxDirectory,
    PATH: `${sandbox.programDirectory}:${process.env.PATH ?? ""}`,
  });

  const stop = async () => {
    await client.stop();
    await editor.stop();
    await metadata.stop();
    remote.cleanUp();
    await rm(sandboxDirectory, { recursive: true, force: true });
  };
  try {
    const clonePath = configuration === "git-and-cookie" ? await readClonePath(client) : undefined;
    return {
      client,
      tools: await client.listTools(),
      known: {
        projectId: remote.projectId,
        filePaths: [...Object.keys(SEEDED_TEXT_FILES), SEEDED_FIGURE_PATH],
        sectionTitles: SEEDED_SECTION_TITLES,
        commitHashes: await readCommitHashes(remote.bareRepositoryDirectory),
        fileRevisions:
          configuration === "git-and-cookie" ? await readFileRevisions(client) : [ANY_FILE_REVISION],
        ...editorValues,
        citationKeys: SEEDED_CITATION_KEYS,
        registeredDoi: REGISTERED_DOI,
        sandboxPaths: sandbox.sandboxPaths,
      },
      stateSources: { clonePath, bareRepositoryDirectory: remote.bareRepositoryDirectory, editor },
      stop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
