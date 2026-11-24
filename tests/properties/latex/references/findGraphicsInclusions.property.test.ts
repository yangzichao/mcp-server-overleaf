import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  findGraphicsInclusions,
  findGraphicsPaths,
  resolveGraphicsInclusion,
} from "../../../../src/latex/references/findGraphicsInclusions.js";
import { visitedSourceFile } from "./visitedSourceFile.js";

const graphicsCommand = fc.constantFrom("includegraphics", "includegraphics*", "includesvg", "includepdf");
const writtenFileName = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.constantFrom(
      "plot",
      "plot.png",
      "figs/plot",
      "plot.PDF",
      "a.b/plot",
      "../up/plot",
      "北京",
      "my plot",
    ),
  },
  { weight: 1, arbitrary: fc.constantFrom('"with space"', "\\figdir/plot", "#1", " ", "/abs/plot.pdf") },
);
const graphicsOptions = fc.constantFrom("", "[width=\\linewidth]", " [scale=0.5] ");

const EXTENSIONS: Record<string, readonly string[]> = {
  includegraphics: [
    ".pdf",
    ".png",
    ".jpg",
    ".mps",
    ".jpeg",
    ".jbig2",
    ".jb2",
    ".PDF",
    ".PNG",
    ".JPG",
    ".JPEG",
    ".JBIG2",
    ".JB2",
    ".eps",
  ],
  includesvg: [".svg"],
  includepdf: [".pdf"],
};

const projectFile = fc.constantFrom(
  "plot.pdf",
  "plot.png",
  "plot.svg",
  "plot.PDF",
  "figs/plot.png",
  "figures/plot.eps",
  "chapters/plot.jpg",
  "a.b/plot.pdf",
  "北京.png",
  "up/plot.pdf",
  "plot",
);

describe("findGraphicsInclusions properties", () => {
  it("reads each figure's file name as written, without quotes, and counts the ones built from macros", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(graphicsCommand, graphicsOptions, writtenFileName), { maxLength: 5 }),
        (written) => {
          const text = written
            .map(([command, options, name]) => `\\${command}${options}{${name}}`)
            .join("\nText ");
          const scan = findGraphicsInclusions(visitedSourceFile("main.tex", text), []);
          const named = written
            .map(([command, , name]) => ({
              command: command.replace(/\*$/, ""),
              fileName: name.trim().replace(/^"(.*)"$/, "$1"),
            }))
            .filter(({ fileName }) => fileName !== "");
          const fromMacros = named.filter(
            ({ fileName }) => fileName.includes("\\") || fileName.includes("#"),
          );
          expect(scan.pathsBuiltFromMacros).toBe(fromMacros.length);
          expect(scan.inclusions.map(({ command, fileName }) => ({ command, fileName }))).toEqual(
            named.filter((inclusion) => !fromMacros.includes(inclusion)),
          );
        },
      ),
    );
  });

  it("resolves a figure only to a project file with an extension its command accepts, inside the project", () => {
    fc.assert(
      fc.property(
        graphicsCommand,
        writtenFileName,
        fc.constantFrom("", "chapters"),
        fc.array(fc.constantFrom("figures/", "figs", "../outside/", ""), { maxLength: 2 }),
        fc.uniqueArray(projectFile, { maxLength: 6 }),
        (command, name, baseDirectory, graphicsPaths, files) => {
          const projectFiles = new Set<string>(files);
          const file = visitedSourceFile(
            `${baseDirectory || "."}/main.tex`.replace(/^\.\//, ""),
            `\\${command}{${name}}`,
            baseDirectory,
          );
          for (const inclusion of findGraphicsInclusions(file, graphicsPaths).inclusions) {
            const lookup = resolveGraphicsInclusion(inclusion, projectFiles);
            if ("tried" in lookup) {
              for (const candidate of lookup.tried) expect(projectFiles.has(candidate)).toBe(false);
              continue;
            }
            expect(projectFiles.has(lookup.found)).toBe(true);
            expect(lookup.found.split("/")).not.toContain("..");
            const extensions = EXTENSIONS[inclusion.command] ?? [];
            expect(
              extensions.some((extension) => lookup.found.toLowerCase().endsWith(extension.toLowerCase())),
            ).toBe(true);
          }
        },
      ),
    );
  });

  it("finds a figure the project holds at its root under one of its command's extensions", () => {
    fc.assert(
      fc.property(
        graphicsCommand,
        fc.constantFrom("plot", "北京", "my plot"),
        fc.nat(),
        (command, name, choice) => {
          const extensions = EXTENSIONS[command.replace(/\*$/, "")] ?? [];
          const present = `${name}${extensions[choice % extensions.length]}`;
          const [inclusion] = findGraphicsInclusions(
            visitedSourceFile("main.tex", `\\${command}{${name}}`),
            [],
          ).inclusions;
          expect(inclusion && resolveGraphicsInclusion(inclusion, new Set([present]))).toEqual({
            found: present,
          });
        },
      ),
    );
  });
});

describe("findGraphicsPaths properties", () => {
  it("reads every directory a \\graphicspath lists, trimmed, in order", () => {
    fc.assert(
      fc.property(
        fc.array(fc.array(fc.constantFrom("figures/", " figs/ ", "a/b/", "", "北京/"), { maxLength: 3 }), {
          maxLength: 3,
        }),
        (lists) => {
          const text = lists
            .map(
              (directories) =>
                `\\graphicspath{${directories.map((directory) => `{${directory}}`).join(" ")}}`,
            )
            .join("\n");
          expect(findGraphicsPaths(visitedSourceFile("main.tex", text))).toEqual(
            lists.flat().map((directory) => directory.trim()),
          );
        },
      ),
    );
  });
});
