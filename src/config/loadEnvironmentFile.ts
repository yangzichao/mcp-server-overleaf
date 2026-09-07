import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * An MCP client spawns this server as a bare subprocess, so the shell environment a
 * human would have exported is not there. Reading a `.env` that sits next to the
 * install lets the Overleaf token live in one file the user can chmod 600, instead of
 * being copied into every client's configuration file.
 */
const ASSIGNMENT_PATTERN = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

function stripSurroundingQuotes(rawValue: string): string {
  const trimmed = rawValue.trim();
  const isQuoted =
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")));
  return isQuoted ? trimmed.slice(1, -1) : trimmed;
}

export function parseEnvironmentFile(fileContents: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const line of fileContents.split("\n")) {
    if (line.trim().startsWith("#")) continue;
    const match = ASSIGNMENT_PATTERN.exec(line);
    const [, name, rawValue] = match ?? [];
    if (name === undefined) continue;
    parsed[name] = stripSurroundingQuotes(rawValue ?? "");
  }
  return parsed;
}

/** The package root, one level above the compiled `dist/` directory. */
export function packageRootDirectory(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

/**
 * Setting either of these means the client is configuring us and the file must stay out
 * of it. Merging the two sources per variable looks helpful but silently assembles a
 * configuration nobody wrote: a client that passes its own OVERLEAF_PROJECTS would
 * inherit a stale OVERLEAF_DEFAULT_PROJECT from the file and fail to start.
 */
const CLIENT_OWNS_CONFIGURATION_VARIABLES = ["OVERLEAF_GIT_TOKEN", "OVERLEAF_PROJECTS"] as const;

export function clientSuppliedConfiguration(environment: NodeJS.ProcessEnv): boolean {
  return CLIENT_OWNS_CONFIGURATION_VARIABLES.some((name) => (environment[name] ?? "").trim() !== "");
}

/**
 * Loads `<package root>/.env` when, and only when, the client left configuration to us.
 * A missing or unreadable file is not an error: the environment alone is a valid setup.
 */
export function loadEnvironmentFileIfPresent(
  environment: NodeJS.ProcessEnv = process.env,
  environmentFilePath: string = resolve(packageRootDirectory(), ".env"),
): void {
  if (clientSuppliedConfiguration(environment)) return;

  let fileContents: string;
  try {
    fileContents = readFileSync(environmentFilePath, "utf8");
  } catch {
    return;
  }

  for (const [name, value] of Object.entries(parseEnvironmentFile(fileContents))) {
    if (environment[name] === undefined) environment[name] = value;
  }
}
