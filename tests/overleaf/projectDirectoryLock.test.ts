import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { withProjectDirectoryLock } from "../../src/overleaf/projectDirectoryLock.js";

const execFileAsync = promisify(execFile);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

let workspaceDirectory: string;
let lockDirectory: string;

beforeEach(() => {
  workspaceDirectory = mkdtempSync(join(tmpdir(), "overleaf-mcp-lock-"));
  lockDirectory = join(workspaceDirectory, ".locks", "project.lock");
});

afterEach(() => {
  rmSync(workspaceDirectory, { recursive: true, force: true });
});

describe("holding and releasing", () => {
  it("returns the action's value", async () => {
    expect(await withProjectDirectoryLock(lockDirectory, async () => "done")).toBe("done");
  });

  it("creates the parent directory rather than failing", async () => {
    await expect(withProjectDirectoryLock(lockDirectory, async () => "ok")).resolves.toBe("ok");
  });

  it("releases the lock afterwards", async () => {
    await withProjectDirectoryLock(lockDirectory, async () => "first");
    await expect(withProjectDirectoryLock(lockDirectory, async () => "second")).resolves.toBe("second");
  });

  it("releases the lock even when the action throws", async () => {
    await expect(
      withProjectDirectoryLock(lockDirectory, () => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
    await expect(withProjectDirectoryLock(lockDirectory, async () => "after")).resolves.toBe("after");
  });

  it("records who holds it while the action runs", async () => {
    await withProjectDirectoryLock(lockDirectory, async () => {
      const owner = JSON.parse(await readFile(join(lockDirectory, "owner.json"), "utf8"));
      expect(owner).toMatchObject({ processId: process.pid, host: hostname() });
    });
  });
});

describe("breaking a lock nobody holds", () => {
  it("takes over from a process that no longer exists", async () => {
    await mkdir(lockDirectory, { recursive: true });
    // Process id 2^22 is above the maximum on Linux and macOS, so it cannot be running.
    const deadOwner = { processId: 4_194_304, host: hostname(), acquiredAtEpochMs: Date.now() };
    await writeFile(join(lockDirectory, "owner.json"), JSON.stringify(deadOwner), "utf8");

    await expect(withProjectDirectoryLock(lockDirectory, async () => "taken over")).resolves.toBe(
      "taken over",
    );
  });

  it("takes over a lock left by a crash before the owner was written", async () => {
    await mkdir(lockDirectory, { recursive: true });
    // Age the empty lock directory past the stale threshold.
    const longAgo = new Date(Date.now() - 60 * 60 * 1000);
    await execFileAsync("touch", ["-t", formatTouchStamp(longAgo), lockDirectory]);

    await expect(withProjectDirectoryLock(lockDirectory, async () => "recovered")).resolves.toBe("recovered");
  });

  it("waits for a live holder instead of stealing the lock", async () => {
    await mkdir(lockDirectory, { recursive: true });
    const liveOwner = { processId: process.pid, host: hostname(), acquiredAtEpochMs: Date.now() };
    await writeFile(join(lockDirectory, "owner.json"), JSON.stringify(liveOwner), "utf8");

    let acquired = false;
    const attempt = withProjectDirectoryLock(lockDirectory, () => {
      acquired = true;
      return Promise.resolve();
    });
    await new Promise((done) => setTimeout(done, 300));
    expect(acquired).toBe(false);

    rmSync(lockDirectory, { recursive: true, force: true });
    await attempt;
    expect(acquired).toBe(true);
  });
});

/** `touch -t` wants YYYYMMDDhhmm.ss in local time. */
function formatTouchStamp(when: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}` +
    `${pad(when.getHours())}${pad(when.getMinutes())}.${pad(when.getSeconds())}`
  );
}

describe("two separate processes", () => {
  it("never run inside the lock at the same time", async () => {
    // Each child appends "in", sleeps, then appends "out". Interleaving would show up as
    // "in,in,out,out". Separate processes share nothing but the lock directory.
    const timelineFile = join(workspaceDirectory, "timeline.txt");
    const script = `
      import { appendFile } from "node:fs/promises";
      import { withProjectDirectoryLock } from ${JSON.stringify(join(packageRoot, "dist", "overleaf", "projectDirectoryLock.js"))};
      await withProjectDirectoryLock(${JSON.stringify(lockDirectory)}, async () => {
        await appendFile(${JSON.stringify(timelineFile)}, \`in \${process.pid}\\n\`);
        await new Promise((done) => setTimeout(done, 400));
        await appendFile(${JSON.stringify(timelineFile)}, \`out \${process.pid}\\n\`);
      });
    `;
    const scriptFile = join(workspaceDirectory, "child.mjs");
    await writeFile(scriptFile, script, "utf8");

    await Promise.all([execFileAsync("node", [scriptFile]), execFileAsync("node", [scriptFile])]);

    const timeline = (await readFile(timelineFile, "utf8")).trim().split("\n");
    expect(timeline).toHaveLength(4);
    expect(timeline[0]?.startsWith("in")).toBe(true);
    expect(timeline[1]?.startsWith("out")).toBe(true);
    expect(timeline[2]?.startsWith("in")).toBe(true);
    expect(timeline[3]?.startsWith("out")).toBe(true);
    // The first process must be the one that finishes first.
    expect(timeline[0]?.split(" ")[1]).toBe(timeline[1]?.split(" ")[1]);
  });
});
