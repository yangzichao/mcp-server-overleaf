export function describeLocalReadProblem(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === "ENOENT" || code === "ENOTDIR") return "it was moved or deleted";
  if (code === "EACCES" || code === "EPERM") return "this computer does not let this server read it";
  return "reading it failed";
}
