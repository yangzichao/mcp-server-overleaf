import { requireArgument } from "../../actions/toolOperations.js";

/** The three shapes suggest takes: one snippet, one whole section, or the whole document. */
export type SuggestionForm =
  | { readonly kind: "snippet"; readonly findText: string; readonly replaceWith: string }
  | { readonly kind: "section"; readonly sectionTitle: string; readonly content: string }
  | { readonly kind: "document"; readonly content: string };

export interface SuggestionArguments {
  readonly findText?: string | undefined;
  readonly replaceWith?: string | undefined;
  readonly sectionTitle?: string | undefined;
  readonly content?: string | undefined;
}

/**
 * Reads which shape a suggest call meant. findText and replaceWith go together, and so do content
 * and an optional sectionTitle; a call that mixes the two pairs has misread the tool, so it fails
 * rather than picking one of them.
 */
export function chooseSuggestionForm(input: SuggestionArguments): SuggestionForm {
  const snippetGiven = input.findText !== undefined || input.replaceWith !== undefined;
  const rewriteGiven = input.sectionTitle !== undefined || input.content !== undefined;
  if (snippetGiven && rewriteGiven) {
    throw new Error(
      "suggest takes findText with replaceWith for one snippet, or content (with sectionTitle for one section) for a rewrite, not both. Nothing was sent.",
    );
  }
  if (rewriteGiven) {
    const content = requireArgument(input.content, "content", "suggest");
    return input.sectionTitle === undefined
      ? { kind: "document", content }
      : { kind: "section", sectionTitle: input.sectionTitle, content };
  }
  if (!snippetGiven) throw new Error("suggest needs findText and replaceWith, or content.");
  return {
    kind: "snippet",
    findText: requireArgument(input.findText, "findText", "suggest"),
    replaceWith: requireArgument(input.replaceWith, "replaceWith", "suggest"),
  };
}
