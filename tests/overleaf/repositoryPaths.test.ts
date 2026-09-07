import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  resolvePathInsideRepository,
  UnsafeRepositoryPathError,
} from "../../src/overleaf/repositoryPaths.js";

const repositoryDirectory = "/tmp/overleaf-mcp-test/project";
const reject = (path: string) => () => resolvePathInsideRepository(repositoryDirectory, path);

describe("resolvePathInsideRepository", () => {
  it("resolves an ordinary relative path", () => {
    expect(resolvePathInsideRepository(repositoryDirectory, "main.tex")).toBe(
      resolve(repositoryDirectory, "main.tex"),
    );
  });

  it("resolves a nested path", () => {
    expect(resolvePathInsideRepository(repositoryDirectory, "sections/intro.tex")).toBe(
      resolve(repositoryDirectory, "sections/intro.tex"),
    );
  });

  it("normalises an interior traversal that stays inside", () => {
    expect(resolvePathInsideRepository(repositoryDirectory, "sections/../main.tex")).toBe(
      resolve(repositoryDirectory, "main.tex"),
    );
  });

  it("trims surrounding whitespace", () => {
    expect(resolvePathInsideRepository(repositoryDirectory, "  main.tex  ")).toBe(
      resolve(repositoryDirectory, "main.tex"),
    );
  });
});

describe("paths the model must not be able to reach", () => {
  it("refuses an empty path", () => {
    expect(reject("")).toThrow(UnsafeRepositoryPathError);
  });

  it("refuses a whitespace-only path", () => {
    expect(reject("   ")).toThrow(UnsafeRepositoryPathError);
  });

  it("refuses an absolute path", () => {
    expect(reject("/etc/passwd")).toThrow(/must be relative/);
  });

  it("refuses traversal out of the repository", () => {
    expect(reject("../../../../etc/passwd")).toThrow(/outside the project/);
  });

  it("refuses a traversal that lands just outside", () => {
    expect(reject("../sibling/main.tex")).toThrow(/outside the project/);
  });

  it("refuses the repository root itself", () => {
    expect(reject(".")).toThrow(/outside the project/);
  });

  it("refuses the .git directory", () => {
    expect(reject(".git/config")).toThrow(/\.git directory/);
  });

  // macOS and Windows filesystems are case-insensitive, so an uppercased spelling reaches
  // the very same directory and has to be refused too.
  it("refuses the .git directory spelled in another case", () => {
    expect(reject(".GIT/config")).toThrow(/\.git directory/);
    expect(reject(".Git/hooks/pre-commit")).toThrow(/\.git directory/);
  });

  it("allows .gitignore, which is an ordinary tracked file", () => {
    expect(resolvePathInsideRepository(repositoryDirectory, ".gitignore")).toBe(
      resolve(repositoryDirectory, ".gitignore"),
    );
  });
});
