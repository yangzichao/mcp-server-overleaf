import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parseSetupOptions, type SetupOptions } from "../../../src/setup/parseSetupOptions.js";
import { SetupError } from "../../../src/setup/setupError.js";
import { projectAddress, projectAlias, writtenProjectId } from "../config/projects/overleafProjectIds.js";

const projectReference = fc.oneof(
  writtenProjectId,
  projectAddress.map(({ written }) => written),
  fc.constantFrom("-h", "my paper", "北京"),
);
const bareReference = projectReference.filter((reference) => !reference.slice(1).includes("="));
const nameWithoutEquals = projectAlias.filter((alias) => !alias.includes("="));

type WrittenOption =
  | {
      readonly kind: "project";
      readonly argv: readonly string[];
      readonly project: SetupOptions["projects"][number];
    }
  | { readonly kind: "serverName"; readonly argv: readonly string[]; readonly serverName: string }
  | { readonly kind: "clients"; readonly argv: readonly string[]; readonly clientIds: string[] }
  | { readonly kind: "tokenFromStandardInput"; readonly argv: readonly string[] }
  | { readonly kind: "acceptDefaults"; readonly argv: readonly string[] };

const clientId = fc.constantFrom("claude-code", "codex", "claude-desktop", "cursor", "none", "made-up");
const writtenOption: fc.Arbitrary<WrittenOption> = fc.oneof(
  bareReference.map((reference) => ({
    kind: "project" as const,
    argv: ["--project", reference],
    project: { reference },
  })),
  fc.tuple(nameWithoutEquals, projectReference).map(([projectName, reference]) => ({
    kind: "project" as const,
    argv: ["--project", `${projectName}=${reference}`],
    project: { projectName: projectName.trim(), reference: reference.trim() },
  })),
  fc
    .string({ minLength: 1, maxLength: 10 })
    .filter((name) => !name.startsWith("--"))
    .map((serverName) => ({ kind: "serverName" as const, argv: ["--server-name", serverName], serverName })),
  fc
    .tuple(fc.array(clientId, { maxLength: 3 }), fc.constantFrom(",", ", ", " ,"), fc.constantFrom("", ","))
    .filter(([clientIds, separator, trailing]) => `${clientIds.join(separator)}${trailing}` !== "")
    .map(([clientIds, separator, trailing]) => ({
      kind: "clients" as const,
      argv: ["--clients", `${clientIds.join(separator)}${trailing}`],
      clientIds,
    })),
  fc.constant({ kind: "tokenFromStandardInput" as const, argv: ["--token-stdin"] }),
  fc.constantFrom("--yes", "-y").map((flag) => ({ kind: "acceptDefaults" as const, argv: [flag] })),
);

function expectedOptions(options: readonly WrittenOption[]): SetupOptions {
  let expected: SetupOptions = {
    projects: [],
    serverName: "overleaf",
    clientIds: [],
    readTokenFromStandardInput: false,
    acceptDefaults: false,
  };
  for (const option of options) {
    if (option.kind === "project")
      expected = { ...expected, projects: [...expected.projects, option.project] };
    else if (option.kind === "serverName") expected = { ...expected, serverName: option.serverName };
    else if (option.kind === "clients") expected = { ...expected, clientIds: option.clientIds };
    else if (option.kind === "tokenFromStandardInput")
      expected = { ...expected, readTokenFromStandardInput: true };
    else expected = { ...expected, acceptDefaults: true };
  }
  return expected;
}

const anyArgument = fc.oneof(
  fc.constantFrom(
    "--project",
    "--server-name",
    "--clients",
    "--token-stdin",
    "--yes",
    "-y",
    "--",
    "--wat",
    "-x",
  ),
  // --help and -h print the usage and exit the process.
  fc.string({ maxLength: 8 }).filter((argument) => !["--help", "-h"].includes(argument)),
);

describe("parseSetupOptions properties", () => {
  it("reads back any sequence of options, with repeated projects in order and the last of anything else", () => {
    fc.assert(
      fc.property(fc.array(writtenOption, { maxLength: 6 }), (options) => {
        expect(parseSetupOptions(options.flatMap((option) => option.argv))).toEqual(expectedOptions(options));
      }),
    );
  });

  it("parses any arguments or refuses them with a SetupError", () => {
    fc.assert(
      fc.property(fc.array(anyArgument, { maxLength: 6 }), (argv) => {
        try {
          parseSetupOptions(argv);
        } catch (error) {
          expect(error).toBeInstanceOf(SetupError);
        }
      }),
    );
  });

  it("takes an address with a query string whole when no name is given", () => {
    fc.assert(
      fc.property(writtenProjectId, (projectId) => {
        const reference = `https://www.overleaf.com/project/${projectId}?a=b`;
        expect(parseSetupOptions(["--project", reference]).projects).toEqual([{ reference }]);
      }),
    );
  });
});
