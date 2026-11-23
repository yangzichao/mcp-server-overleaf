type SnippetSearch =
  | { readonly status: "not-found" }
  | { readonly status: "ambiguous"; readonly occurrenceCount: number }
  | { readonly status: "replaced" };

export function requireSnippetReplaced<Search extends SnippetSearch>(
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
