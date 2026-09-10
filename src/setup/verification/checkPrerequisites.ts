import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PACKAGE_SUPPORTED_NODE_RANGE } from "../../config/packageMetadata.js";
import { SetupError } from "../setupError.js";

const execFileAsync = promisify(execFile);

const INSTALL_GIT_BY_PLATFORM: Readonly<Record<string, string>> = {
  darwin: "Install the Xcode command line tools with: xcode-select --install",
  linux: "Install git with your package manager, for example: sudo apt install git",
  win32: "Install Git for Windows from https://git-scm.com/download/win",
};

function parseVersionNumbers(version: string): readonly number[] {
  return version.split(".").map((part) => Number.parseInt(part, 10) || 0);
}

function isAtLeast(candidate: string, minimum: string): boolean {
  const candidateParts = parseVersionNumbers(candidate);
  const minimumParts = parseVersionNumbers(minimum);
  for (let index = 0; index < minimumParts.length; index += 1) {
    const left = candidateParts[index] ?? 0;
    const right = minimumParts[index] ?? 0;
    if (left !== right) return left > right;
  }
  return true;
}

export interface Prerequisites {
  readonly nodeVersion: string;
  readonly gitVersion: string;
}

/**
 * Both failures here are cheaper to report now than as a client that silently fails to
 * start an hour later, with the reason buried in a log the user does not know about.
 */
export async function checkPrerequisites(): Promise<Prerequisites> {
  const minimumNodeVersion = PACKAGE_SUPPORTED_NODE_RANGE.replace(/[^\d.]/g, "");
  const nodeVersion = process.versions.node;
  if (minimumNodeVersion && !isAtLeast(nodeVersion, minimumNodeVersion)) {
    throw new SetupError(
      `This server needs Node ${PACKAGE_SUPPORTED_NODE_RANGE} and is running on ${nodeVersion}.`,
      "Install Node 24 LTS from https://nodejs.org and run this command again.",
    );
  }

  let gitVersion: string;
  try {
    const { stdout } = await execFileAsync("git", ["--version"], { timeout: 15_000 });
    gitVersion = stdout.trim();
  } catch {
    throw new SetupError(
      "git is not available on this computer.",
      INSTALL_GIT_BY_PLATFORM[process.platform] ?? "Install git from https://git-scm.com/downloads",
    );
  }

  return { nodeVersion, gitVersion };
}
