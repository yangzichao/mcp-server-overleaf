import { mkdtempSync, rmSync } from "node:fs";
import { access, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { compileLatexProject } from "../../src/workflow/compileLatexProject.js";
import { shouldRunTexTests } from "../support/texAvailability.js";

const describeWithLatex = describe.runIf(await shouldRunTexTests());

/**
 * The root file name reaches compileLatexProject from a model, and latexmk parses any
 * argument starting with a dash as an option. Passing the name as "./<name>" keeps it a
 * file name, whatever it is called.
 */
let repositoryDirectory: string;
let buildDirectory: string;

const document = "\\documentclass{article}\n\\begin{document}\nHello.\n\\end{document}\n";

const fileExists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

beforeEach(() => {
  repositoryDirectory = mkdtempSync(join(tmpdir(), "overleaf-mcp-dashname-"));
  buildDirectory = mkdtempSync(join(tmpdir(), "overleaf-mcp-dashname-build-"));
});

afterEach(() => {
  rmSync(repositoryDirectory, { recursive: true, force: true });
  rmSync(buildDirectory, { recursive: true, force: true });
});

describeWithLatex("a file whose name starts with a dash", () => {
  it("is compiled as a file rather than read as an option", async () => {
    await writeFile(join(repositoryDirectory, "-weird.tex"), document, "utf8");

    const result = await compileLatexProject({
      repositoryDirectory,
      buildDirectory,
      mainTexFile: "-weird.tex",
      timeoutMs: 120_000,
    });

    expect(result.succeeded).toBe(true);
    expect(await fileExists(join(buildDirectory, "-weird.pdf"))).toBe(true);
  });

  it("does not reach latexmk as an option, whatever the rest of the name says", async () => {
    // latexmk's -e runs Perl. This build rejects the one-token form, but the name must
    // never be offered to the option parser in the first place.
    const optionShapedName = '-esystem("touch PERL_EXECUTED").tex';
    await writeFile(join(repositoryDirectory, optionShapedName), document, "utf8");

    const result = await compileLatexProject({
      repositoryDirectory,
      buildDirectory,
      mainTexFile: optionShapedName,
      timeoutMs: 120_000,
    });

    // Whether TeX itself can cope with quotes in a file name is its own business. What
    // matters here is that latexmk treated the name as a file and ran no Perl.
    expect(result.tailOfLog).not.toContain("unknown option");
    expect(await fileExists(join(repositoryDirectory, "PERL_EXECUTED"))).toBe(false);
  });
});

describeWithLatex("an ordinary document", () => {
  it("still compiles", async () => {
    await writeFile(join(repositoryDirectory, "main.tex"), document, "utf8");

    const result = await compileLatexProject({
      repositoryDirectory,
      buildDirectory,
      mainTexFile: "main.tex",
      timeoutMs: 120_000,
    });

    expect(result.succeeded).toBe(true);
    expect(await fileExists(join(buildDirectory, "main.pdf"))).toBe(true);
  });
});
