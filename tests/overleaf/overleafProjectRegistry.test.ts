import { rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadServerConfigurationFromEnvironment } from "../../src/config/serverConfiguration.js";
import { OverleafProjectRegistry, UnknownProjectError } from "../../src/overleaf/overleafProjectRegistry.js";
import { FakeOverleafRemote } from "../integration/fakeOverleafRemote.js";

const thesisId = "65b2c3d4e5f6a7b8c9d0e1f2";

let remote: FakeOverleafRemote;

/** A registry pointed at the fake remote, so openRepository really clones. */
function registryWith(overrides: NodeJS.ProcessEnv = {}): OverleafProjectRegistry {
  return new OverleafProjectRegistry(
    loadServerConfigurationFromEnvironment({ ...remote.environment(), ...overrides }),
  );
}

beforeEach(async () => {
  remote = await FakeOverleafRemote.create("b4a1b2c3d4e5f6a7b8c9d0e1");
  await remote.collaboratorPushes("main.tex", "\\section{A}\n", "Initial draft");
});

afterEach(() => {
  remote.cleanUp();
});

describe("resolving which project a call means", () => {
  it("lists the registered names", () => {
    expect(registryWith().listRegisteredProjectNames()).toEqual(["paper"]);
  });

  it("falls back to the single registered project when none is named", async () => {
    const repository = await registryWith().openRepository(undefined);
    expect(repository.repositoryDirectory).toContain(remote.projectId);
  });

  it("accepts a raw project id that was never registered", async () => {
    const repository = await registryWith().openRepository(remote.projectId);
    expect(repository.repositoryDirectory).toContain(remote.projectId);
  });

  it("rejects an unregistered name and says what is configured", async () => {
    await expect(registryWith().openRepository("nope")).rejects.toThrow(/Configured projects: paper/);
  });

  it("rejects an unregistered name with UnknownProjectError", async () => {
    await expect(registryWith().openRepository("nope")).rejects.toBeInstanceOf(UnknownProjectError);
  });

  it("asks for a project when several are registered and no default is set", async () => {
    const registry = registryWith({ OVERLEAF_PROJECTS: `paper=${remote.projectId},thesis=${thesisId}` });
    await expect(registry.openRepository(undefined)).rejects.toThrow(/No project given/);
  });

  it("uses the configured default when several are registered", async () => {
    const registry = registryWith({
      OVERLEAF_PROJECTS: `paper=${remote.projectId},thesis=${thesisId}`,
      OVERLEAF_DEFAULT_PROJECT: "paper",
    });
    expect((await registry.openRepository(undefined)).repositoryDirectory).toContain(remote.projectId);
  });
});

describe("caching clones", () => {
  it("returns the same repository for the same project", async () => {
    const registry = registryWith();
    const [first, second] = [await registry.openRepository("paper"), await registry.openRepository("paper")];
    expect(first).toBe(second);
  });

  it("returns the same repository whether asked by name or by id", async () => {
    const registry = registryWith();
    const byName = await registry.openRepository("paper");
    expect(await registry.openRepository(remote.projectId)).toBe(byName);
  });

  it("clones once when two calls race, rather than twice into one directory", async () => {
    const registry = registryWith();
    const [first, second] = await Promise.all([
      registry.openRepository("paper"),
      registry.openRepository("paper"),
    ]);
    expect(first).toBe(second);
    expect(await first.listTrackedFiles()).toEqual(["main.tex"]);
  });

  it("does not cache a failed clone, so a later call can still succeed", async () => {
    const registry = registryWith();
    const missingProjectId = "ffffffffffffffffffffffff";

    await expect(registry.openRepository(missingProjectId)).rejects.toThrow();
    // Make the same project available after the failed attempt. A cached rejection
    // would still reject here, even though the remote can now be cloned.
    await rename(
      remote.bareRepositoryDirectory,
      join(dirname(remote.bareRepositoryDirectory), missingProjectId),
    );
    const repository = await registry.openRepository(missingProjectId);
    expect(await repository.listTrackedFiles()).toEqual(["main.tex"]);
  });
});

describe("serializing tool calls per project", () => {
  it("runs two calls for one project one after the other, never interleaved", async () => {
    const registry = registryWith();
    const events: string[] = [];

    const slowCall = registry.withRepository("paper", async () => {
      events.push("first in");
      await new Promise((done) => setTimeout(done, 50));
      events.push("first out");
    });
    const fastCall = registry.withRepository("paper", () => {
      events.push("second in");
      events.push("second out");
      return Promise.resolve();
    });

    await Promise.all([slowCall, fastCall]);
    expect(events).toEqual(["first in", "first out", "second in", "second out"]);
  });

  it("does not lose an edit when two writes race on the same file", async () => {
    const registry = registryWith();

    // Each call reads, pauses, then appends. Without the lock both read the same text
    // and the second write drops the first one's line.
    const appendLine = (line: string) =>
      registry.withRepository("paper", async (repository) => {
        const before = await repository.readTextFile("main.tex");
        await new Promise((done) => setTimeout(done, 20));
        await repository.writeTextFile("main.tex", `${before}${line}\n`);
      });

    await Promise.all([appendLine("one"), appendLine("two")]);

    const finalText = await (await registry.openRepository("paper")).readTextFile("main.tex");
    expect(finalText).toContain("one");
    expect(finalText).toContain("two");
  });

  it("keeps the queue running after a call throws", async () => {
    const registry = registryWith();

    await expect(registry.withRepository("paper", () => Promise.reject(new Error("boom")))).rejects.toThrow(
      "boom",
    );
    await expect(registry.withRepository("paper", async () => "still works")).resolves.toBe("still works");
  });

  it("rejects rather than throwing synchronously for an unknown project", async () => {
    const attempt = registryWith().withRepository("nope", async () => "unreachable");
    await expect(attempt).rejects.toBeInstanceOf(UnknownProjectError);
  });
});
