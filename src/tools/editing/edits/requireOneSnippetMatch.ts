/** What a search for replace_text's snippet found, in the clone or in the editor. */
type SnippetSearch =
  | { readonly status: "not-found" }
  | { readonly status: "ambiguous"; readonly occurrenceCount: number }
  | { readonly status: "replaced" };

/**
 * Refuses a snippet that is missing, or that appears more than once without replaceAll, so an
 * edit that changed nothing never looks like a success. The clone and the editor say it alike.
 */
export function requireOneSnippetMatch<Search extends SnippetSearch>(
  path: string,
  search: Search,
): asserts search is Extract<Search, { status: "replaced" }> {
  const found: SnippetSearch = search;
  if (found.status === "not-found") throw new Error(`Text not found in ${path}. Nothing was changed.`);
  if (found.status === "ambiguous") {
    throw new Error(
      `Text appears ${found.occurrenceCount} times in ${path}. Nothing was changed. ` +
        "Include more surrounding context to make the match unique, or set replaceAll.",
    );
  }
}
