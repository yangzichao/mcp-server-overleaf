import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { serverEntryPoint } from "../support/serverUnderTest.js";
import { FakeOverleafRemote } from "./fakeOverleafRemote.js";

interface SetupRun {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runSetup(
  args: readonly string[],
  options: { configurationHome: string; gitBaseUrl: string; token?: string },
): Promise<SetupRun> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [serverEntryPoint, "setup", ...args], {
      env: {
        ...process.env,
        XDG_CONFIG_HOME: options.configurationHome,
        APPDATA: options.configurationHome,
        OVERLEAF_GIT_BASE_URL: options.gitBaseUrl,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", rejectRun);
    child.on("close", (exitCode) => resolveRun({ exitCode, stdout, stderr }));
    child.stdin.end(options.token ?? "");
  });
}

describe("setup command", () => {
  let remote: FakeOverleafRemote;
  let configurationHome: string;

  beforeEach(async () => {
    remote = await FakeOverleafRemote.create();
    configurationHome = mkdtempSync(join(tmpdir(), "overleaf-mcp-setup-"));
  });

  afterEach(() => {
    remote.cleanUp();
    rmSync(configurationHome, { recursive: true, force: true });
  });

  it("verifies the project, then writes the configuration the server discovers on its own", async () => {
    const run = await runSetup(
      ["--project", `paper=${remote.projectId}`, "--token-stdin", "--clients", "none"],
      { configurationHome, gitBaseUrl: remote.gitBaseUrl, token: "olp_test_token\n" },
    );

    expect(run.stderr).toBe("");
    expect(run.exitCode).toBe(0);

    const configurationPath = join(configurationHome, "overleaf-mcp", "projects.json");
    expect(JSON.parse(readFileSync(configurationPath, "utf8"))).toEqual({
      projects: { paper: { projectId: remote.projectId, gitToken: "olp_test_token" } },
    });
    if (process.platform !== "win32") {
      expect(statSync(configurationPath).mode & 0o777).toBe(0o600);
    }
  });

  it("keeps the token out of everything it prints", async () => {
    const run = await runSetup(["--project", remote.projectId, "--token-stdin", "--clients", "none"], {
      configurationHome,
      gitBaseUrl: remote.gitBaseUrl,
      token: "olp_secret_value",
    });

    expect(run.exitCode).toBe(0);
    expect(`${run.stdout}${run.stderr}`).not.toContain("olp_secret_value");
  });

  it("refuses a project the account cannot reach, and writes nothing", async () => {
    const run = await runSetup(
      ["--project", "65b2c3d4e5f6a7b8c9d0e1f2", "--token-stdin", "--clients", "none"],
      { configurationHome, gitBaseUrl: remote.gitBaseUrl, token: "olp_test_token" },
    );

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toMatch(/does not show that project/i);
    expect(() => readFileSync(join(configurationHome, "overleaf-mcp", "projects.json"))).toThrow();
  });

  it("adds a second project without dropping the first", async () => {
    const first = await runSetup(
      ["--project", `paper=${remote.projectId}`, "--token-stdin", "--clients", "none"],
      { configurationHome, gitBaseUrl: remote.gitBaseUrl, token: "olp_test_token" },
    );
    expect(first.exitCode).toBe(0);

    const second = await runSetup(
      ["--project", `paper=${remote.projectId}`, "--token-stdin", "--clients", "none"],
      { configurationHome, gitBaseUrl: remote.gitBaseUrl, token: "olp_rotated_token" },
    );
    expect(second.exitCode).toBe(0);

    const configuration = JSON.parse(
      readFileSync(join(configurationHome, "overleaf-mcp", "projects.json"), "utf8"),
    );
    expect(configuration.projects.paper.gitToken).toBe("olp_rotated_token");
    expect(readFileSync(join(configurationHome, "overleaf-mcp", "projects.json.previous"), "utf8")).toContain(
      "olp_test_token",
    );
  });
});
