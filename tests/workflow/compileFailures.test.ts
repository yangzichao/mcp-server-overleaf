import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compileLatexProject } from "../../src/workflow/compileLatexProject.js";
import {
  waitForRecordedProcessId,
  writeFakeExecutable,
  writeHangingExecutable,
} from "../support/fakeExecutable.js";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "overleaf-compiler-failure-"));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
const compile = (timeoutMs = 5000) =>
  compileLatexProject({
    repositoryDirectory: directory,
    buildDirectory: join(directory, "build"),
    mainTexFile: "main.tex",
    timeoutMs,
  });

const HUNG_COMPILER_TIMEOUT_MS = 5000;

describe("compiler failures without a TeX dependency", () => {
  it("explains a missing executable", async () => {
    vi.stubEnv("PATH", directory);
    await expect(compile()).rejects.toThrow("latexmk was not found on PATH");
  });

  it("terminates a hung compiler, reports the timeout, and permits another compile", async () => {
    const processIdFile = join(directory, "hung-compiler.pid");
    await writeHangingExecutable(directory, "latexmk", processIdFile);
    vi.stubEnv("PATH", directory);

    // Generous on purpose. The child has to start and record its id before the timeout
    // fires, and how long the operating system takes over starting a freshly written
    // executable is not something this test can bound. A short budget made this fail
    // roughly once in eight full-suite runs, reading an id that was never written.
    const startedAt = Date.now();
    const [result, childProcessId] = await Promise.all([
      compile(HUNG_COMPILER_TIMEOUT_MS),
      waitForRecordedProcessId(processIdFile, HUNG_COMPILER_TIMEOUT_MS),
    ]);

    expect(result.succeeded).toBe(false);
    expect(result.errorLines.join("\n")).toContain("timed out");
    expect(Date.now() - startedAt).toBeLessThan(HUNG_COMPILER_TIMEOUT_MS + 4000);
    expect(() => process.kill(childProcessId, 0)).toThrow();

    await writeFakeExecutable(directory, "latexmk", 'process.stdout.write("Compiled successfully\\n");');
    expect((await compile()).succeeded).toBe(true);
  }, 30_000);

  it("reports exit failures even without recognizable TeX diagnostics", async () => {
    await writeFakeExecutable(
      directory,
      "latexmk",
      'process.stderr.write("Compiler unavailable\\n"); process.exit(7);',
    );
    vi.stubEnv("PATH", directory);
    const result = await compile();
    expect(result.succeeded).toBe(false);
    expect(result.errorLines.length).toBeGreaterThan(0);
    expect(result.tailOfLog).toContain("Compiler unavailable");
  });

  it("extracts and bounds compiler errors and warnings", async () => {
    await writeFakeExecutable(
      directory,
      "latexmk",
      `
      for (let index = 0; index < 60; index++) {
        process.stdout.write('main.tex:12: Invalid command\\nLaTeX Warning: Missing reference\\n');
      }
      process.exit(1);
    `,
    );
    vi.stubEnv("PATH", directory);
    const result = await compile();
    expect(result.succeeded).toBe(false);
    expect(result.errorLines).toHaveLength(40);
    expect(result.warningLines).toHaveLength(40);
    expect(result.tailOfLog.split("\n").length).toBeLessThanOrEqual(40);
  });
});
