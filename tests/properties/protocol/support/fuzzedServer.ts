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

/** A Git token with a session cookie offers all 15 tools; a cookie alone offers the editor's 13. */
export type FuzzedConfiguration = "git-and-cookie" | "cookie-only";

export interface FuzzedServer {
  readonly client: McpStdioClient;
  readonly tools: readonly McpToolDescription[];
  readonly known: KnownProjectValues;
  readonly stateSources: ProjectStateSources;
  stop(): Promise<void>;
}

const ANY_FILE_REVISION = "0".repeat(64);

/** The revision read_file reports for each seeded text file, for guarded edits and smart reads. */
async function readFileRevisions(client: McpStdioClient): Promise<string[]> {
  const revisions: string[] = [];
  for (const path of Object.keys(SEEDED_TEXT_FILES)) {
    const text = await client.call("read_file", { project: "paper", path, mode: "full" });
    try {
      const revision = (JSON.parse(text) as { revision?: unknown }).revision;
      if (typeof revision === "string") revisions.push(revision);
    } catch {
      // A read the configuration cannot answer in mode full leaves nothing to collect.
    }
  }
  return revisions.length > 0 ? revisions : [ANY_FILE_REVISION];
}

async function readCommitHashes(bareRepositoryDirectory: string): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["log", "--format=%H", "main"], {
    cwd: bareRepositoryDirectory,
  });
  return stdout.split("\n").filter(Boolean);
}

/** The clone's path, from the first line of read_project's overview: "Local clone: <path>". */
async function readClonePath(client: McpStdioClient): Promise<string> {
  const overview = await client.call("read_project", { project: "paper" });
  const firstLine = overview.split("\n")[0] ?? "";
  if (!firstLine.startsWith("Local clone: ")) throw new Error(`No clone path in the overview:\n${overview}`);
  return firstLine.slice("Local clone: ".length);
}

/**
 * The server over stdio with fakes for everything it reaches: the Git remote, the editor and
 * web application, doi.org, Crossref and arXiv, latexmk and texcount. Nothing leaves the machine.
 */
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
    // An explicit, empty settings file, so no .env in the checkout can add a real credential.
    OVERLEAF_MCP_ENV_FILE: sandbox.emptyEnvironmentFile,
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
        fileRevisions: await readFileRevisions(client),
        ...editorValues,
        citationKeys: SEEDED_CITATION_KEYS,
        registeredDoi: REGISTERED_DOI,
        localPaths: sandbox.localPaths,
      },
      stateSources: { clonePath, bareRepositoryDirectory: remote.bareRepositoryDirectory, editor },
      stop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
