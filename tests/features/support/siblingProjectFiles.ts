import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

import type { FakeOverleafRemote } from "../../integration/fakeOverleafRemote.js";

const execFileAsync = promisify(execFile);

/** A file as it stands "on Overleaf" in another paper of the same account. */
export async function readSiblingProjectFile(
  remote: FakeOverleafRemote,
  projectId: string,
  relativePath: string,
): Promise<string> {
  const { stdout } = await execFileAsync("git", ["show", `main:${relativePath}`], {
    cwd: join(remote.gitBaseUrl, projectId),
  });
  return stdout;
}
