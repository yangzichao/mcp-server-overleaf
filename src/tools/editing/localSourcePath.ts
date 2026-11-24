import { isAbsolute, resolve, sep } from "node:path";

/**
 * Where an upload may be read from on this computer: an absolute path with no hidden file or
 * directory anywhere in it, since that is where SSH keys, cloud credentials and `.env` files live.
 */
export function requireVisibleAbsolutePath(sourcePath: string, kind: "file" | "folder"): string {
  if (!isAbsolute(sourcePath)) {
    const example = kind === "file" ? "/Users/me/figures/plot.png" : "/Users/me/figures";
    throw new Error(`sourcePath must be an absolute path to a ${kind} on this computer, e.g. ${example}.`);
  }
  const absolutePath = resolve(sourcePath);
  const hiddenPart = absolutePath
    .split(sep)
    .find((part) => part.startsWith(".") && part !== "." && part !== "..");
  if (hiddenPart) {
    throw new Error(
      `Refusing to upload from a hidden path (${hiddenPart}): hidden files and directories usually hold credentials or settings, not paper material.`,
    );
  }
  return absolutePath;
}
