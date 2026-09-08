import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import {
  clientSuppliedConfiguration,
  loadEnvironmentFileIfPresent,
  parseEnvironmentFile,
} from "../../src/config/loadEnvironmentFile.js";

let environmentFilePath: string;
let missingFilePath: string;

beforeAll(() => {
  const directory = mkdtempSync(join(tmpdir(), "overleaf-mcp-env-"));
  environmentFilePath = join(directory, ".env");
  missingFilePath = join(directory, "absent");
  writeFileSync(
    environmentFilePath,
    [
      "# a comment",
      "OVERLEAF_GIT_TOKEN=olp_fromfile",
      'OVERLEAF_PROJECTS="paper=aaaaaaaaaaaaaaaaaaaaaaaa"',
      "OVERLEAF_DEFAULT_PROJECT = paper ",
      "export OVERLEAF_MCP_HTTP_PORT=3017",
      "",
      "MALFORMED LINE",
    ].join("\n"),
  );
});

describe("parseEnvironmentFile", () => {
  it("reads assignments, ignoring comments and malformed lines", () => {
    expect(parseEnvironmentFile(["# c", "A=1", "junk", "B=2"].join("\n"))).toEqual({ A: "1", B: "2" });
  });

  it("strips matching surrounding quotes and whitespace", () => {
    expect(parseEnvironmentFile("A=\"two\"\nB='three'\nC = four ")).toEqual({
      A: "two",
      B: "three",
      C: "four",
    });
  });

  it("accepts a leading export", () => {
    expect(parseEnvironmentFile("export A=1")).toEqual({ A: "1" });
  });

  it("keeps an inner equals sign in the value", () => {
    expect(parseEnvironmentFile("OVERLEAF_PROJECTS=paper=abc,thesis=def")).toEqual({
      OVERLEAF_PROJECTS: "paper=abc,thesis=def",
    });
  });

  it("does not strip mismatched quotes", () => {
    expect(parseEnvironmentFile('A="unbalanced')).toEqual({ A: '"unbalanced' });
  });
});

describe("clientSuppliedConfiguration", () => {
  it("is true when the client set the token", () => {
    expect(clientSuppliedConfiguration({ OVERLEAF_GIT_TOKEN: "olp_x" })).toBe(true);
  });

  it("is true when the client set the project list", () => {
    expect(clientSuppliedConfiguration({ OVERLEAF_PROJECTS: "paper=x" })).toBe(true);
  });

  it("treats a blank value as not configured", () => {
    expect(clientSuppliedConfiguration({ OVERLEAF_GIT_TOKEN: "   " })).toBe(false);
  });

  it("is false for an environment with only unrelated variables", () => {
    expect(clientSuppliedConfiguration({ PATH: "/usr/bin" })).toBe(false);
  });
});

describe("loadEnvironmentFileIfPresent", () => {
  it("takes the whole file when the environment configures nothing", () => {
    const environment: NodeJS.ProcessEnv = {};
    loadEnvironmentFileIfPresent(environment, environmentFilePath);
    expect(environment).toEqual({
      OVERLEAF_GIT_TOKEN: "olp_fromfile",
      OVERLEAF_PROJECTS: "paper=aaaaaaaaaaaaaaaaaaaaaaaa",
      OVERLEAF_DEFAULT_PROJECT: "paper",
      OVERLEAF_MCP_HTTP_PORT: "3017",
    });
  });

  // The regression this rule exists for: a client passing only OVERLEAF_PROJECTS used to
  // inherit OVERLEAF_DEFAULT_PROJECT from the file, naming a project it had not registered,
  // and the server refused to start.
  it("ignores the file entirely once the client sets the project list", () => {
    const environment: NodeJS.ProcessEnv = { OVERLEAF_PROJECTS: "thesis=bbbbbbbbbbbbbbbbbbbbbbbb" };
    loadEnvironmentFileIfPresent(environment, environmentFilePath);
    expect(environment).toEqual({ OVERLEAF_PROJECTS: "thesis=bbbbbbbbbbbbbbbbbbbbbbbb" });
  });

  it("ignores the file entirely once the client sets the token", () => {
    const environment: NodeJS.ProcessEnv = { OVERLEAF_GIT_TOKEN: "olp_fromclient" };
    loadEnvironmentFileIfPresent(environment, environmentFilePath);
    expect(environment).toEqual({ OVERLEAF_GIT_TOKEN: "olp_fromclient" });
  });

  it("still reads the file when only unrelated variables are set", () => {
    const environment: NodeJS.ProcessEnv = { PATH: "/usr/bin" };
    loadEnvironmentFileIfPresent(environment, environmentFilePath);
    expect(environment.OVERLEAF_GIT_TOKEN).toBe("olp_fromfile");
  });

  it("is a no-op when the file does not exist", () => {
    const environment: NodeJS.ProcessEnv = {};
    loadEnvironmentFileIfPresent(environment, missingFilePath);
    expect(environment).toEqual({});
  });

  it("loads an explicit external file even when a client overrides one variable", () => {
    const environment: NodeJS.ProcessEnv = {
      OVERLEAF_MCP_ENV_FILE: environmentFilePath,
      OVERLEAF_GIT_TOKEN: "olp_override",
    };
    loadEnvironmentFileIfPresent(environment, missingFilePath);
    expect(environment.OVERLEAF_GIT_TOKEN).toBe("olp_override");
    expect(environment.OVERLEAF_PROJECTS).toBe("paper=aaaaaaaaaaaaaaaaaaaaaaaa");
  });

  it("fails for an explicitly selected missing file instead of silently falling back", () => {
    expect(() =>
      loadEnvironmentFileIfPresent({ OVERLEAF_MCP_ENV_FILE: missingFilePath }, environmentFilePath),
    ).toThrow("Cannot read OVERLEAF_MCP_ENV_FILE");
  });

  it("rejects a relative explicit path because MCP clients have arbitrary working directories", () => {
    expect(() =>
      loadEnvironmentFileIfPresent({ OVERLEAF_MCP_ENV_FILE: "./.env" }, environmentFilePath),
    ).toThrow("must be an absolute path");
  });

  it("rejects an unreadable explicit directory instead of ignoring it", () => {
    expect(() =>
      loadEnvironmentFileIfPresent({ OVERLEAF_MCP_ENV_FILE: `${environmentFilePath}/..` }),
    ).toThrow("Cannot read OVERLEAF_MCP_ENV_FILE");
  });
});
