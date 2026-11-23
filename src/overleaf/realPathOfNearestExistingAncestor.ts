import { realpath } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * The nearest ancestor of `path` that exists on disk, with every symlink resolved and each name
 * spelled as the disk stores it, which on a disk that ignores case may differ from `path`.
 */
export async function realPathOfNearestExistingAncestor(path: string): Promise<string> {
  let candidate = path;
  for (;;) {
    try {
      return await realpath(candidate);
    } catch {
      const parent = dirname(candidate);
      if (parent === candidate) return candidate;
      candidate = parent;
    }
  }
}
