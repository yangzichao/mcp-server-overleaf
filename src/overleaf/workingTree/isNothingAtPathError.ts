/** ENOENT, or ENOTDIR for a path inside a file such as main.tex/intro.tex: nothing is at the path. */
export function isNothingAtPathError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
}
