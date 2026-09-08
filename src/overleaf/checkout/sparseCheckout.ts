import type { GitCommandResult } from "../gitCommandRunner.js";

export type CheckoutMode = "full" | "text-only";
type RunGit = (args: readonly string[], options?: { tolerateFailure?: boolean }) => Promise<GitCommandResult>;

const TEXT_EXTENSIONS = [
  "tex",
  "ltx",
  "bib",
  "bst",
  "cls",
  "sty",
  "bbl",
  "cfg",
  "txt",
  "md",
  "csv",
  "tsv",
  "json",
  "yaml",
  "yml",
];

export async function configureSparseCheckout(runGit: RunGit, requestedMode: CheckoutMode): Promise<void> {
  const previous = await runGit(["config", "--get", "overleaf-mcp.checkoutMode"], { tolerateFailure: true });
  if (previous.stdout.trim() === requestedMode) return;
  if (requestedMode === "text-only") {
    const status = await runGit(["status", "--porcelain"]);
    const ignoredFiles = await runGit(["ls-files", "--others", "--ignored", "--exclude-standard", "-z"]);
    if (status.stdout.trim() || ignoredFiles.stdout)
      throw new Error(
        "Cannot enable text-only checkout while local edits or ignored files exist. Keep OVERLEAF_MCP_CHECKOUT_MODE=full while reviewing and preserving them first.",
      );
    // Individual argv values: never let a shell expand patterns against the server's cwd.
    const patterns = TEXT_EXTENSIONS.flatMap((extension) => [
      `*.${extension}`,
      `*.${extension.toUpperCase()}`,
    ]);
    await runGit(["sparse-checkout", "set", "--no-cone", "--", ...patterns]);
  } else {
    await materializeFullCheckout(runGit);
  }
  await runGit(["config", "overleaf-mcp.checkoutMode", requestedMode]);
}

/** Expansion is sticky until a deliberate configuration change; never repeatedly hide files. */
export async function materializeFullCheckout(runGit: RunGit): Promise<void> {
  const sparse = await runGit(["config", "--bool", "core.sparseCheckout"], { tolerateFailure: true });
  if (sparse.stdout.trim() === "true") await runGit(["sparse-checkout", "disable"]);
}
