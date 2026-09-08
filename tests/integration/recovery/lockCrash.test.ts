import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { withProjectDirectoryLock } from "../../../src/overleaf/projectDirectoryLock.js";
import { serverEntryPoint } from "../../support/serverUnderTest.js";
import { FakeOverleafRemote } from "../fakeOverleafRemote.js";
import { McpStdioClient } from "../mcpStdioClient.js";

it("recovers the actual lock left by a killed process and preserves its saved draft", async () => {
  const directory = await mkdtemp(join(tmpdir(), "overleaf-lock-crash-"));
  const lockDirectory = join(directory, "project.lock");
  const draftFile = join(directory, "draft.tex");
  const moduleUrl = pathToFileURL(
    resolve(dirname(serverEntryPoint), "overleaf/projectDirectoryLock.js"),
  ).href;
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import { writeFile } from 'node:fs/promises';
    import { withProjectDirectoryLock } from ${JSON.stringify(moduleUrl)};
    await withProjectDirectoryLock(${JSON.stringify(lockDirectory)}, async () => {
      await writeFile(${JSON.stringify(draftFile)}, 'Saved local draft');
      process.stdout.write('locked');
      await new Promise(() => setInterval(() => {}, 1000));
    });
  `,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const exited = new Promise<void>((resolvePromise) => child.once("exit", () => resolvePromise()));
  try {
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const timeout = setTimeout(() => rejectPromise(new Error("Child never acquired the lock")), 5000);
      child.once("error", (error) => {
        clearTimeout(timeout);
        rejectPromise(error);
      });
      child.once("exit", () => {
        clearTimeout(timeout);
        rejectPromise(new Error("Child exited before acquiring lock"));
      });
      child.stdout.on("data", () => {
        clearTimeout(timeout);
        resolvePromise();
      });
    });
    child.kill("SIGKILL");
    await exited;
    expect(JSON.parse(await readFile(join(lockDirectory, "owner.json"), "utf8")).processId).toBe(child.pid);
    const draft = await withProjectDirectoryLock(lockDirectory, () => readFile(draftFile, "utf8"));
    expect(draft).toBe("Saved local draft");
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await exited;
    await rm(directory, { recursive: true, force: true });
  }
});

it("serializes real MCP clients editing one shared project without losing either edit", async () => {
  const remote = await FakeOverleafRemote.create();
  const clients: McpStdioClient[] = [];
  try {
    await remote.collaboratorPushes("main.tex", "First original.\nSecond original.\n", "Initial draft");
    clients.push(await McpStdioClient.start(remote.environment()));
    clients.push(await McpStdioClient.start(remote.environment()));
    const responses = await Promise.all(
      clients.map((client, index) =>
        client.callRaw("replace_text", {
          path: "main.tex",
          findText: index === 0 ? "First original." : "Second original.",
          replaceWith: `Client ${index} edit.`,
        }),
      ),
    );
    expect(responses.every((response) => !response.error && !response.result?.isError)).toBe(true);
    const text = await readFile(join(remote.workspaceDirectory, remote.projectId, "main.tex"), "utf8");
    expect(text).toContain("Client 0 edit.");
    expect(text).toContain("Client 1 edit.");
    expect(await remote.readPublishedFile("main.tex")).toContain("First original.");
  } finally {
    await Promise.all(clients.map((client) => client.stop()));
    remote.cleanUp();
  }
});
