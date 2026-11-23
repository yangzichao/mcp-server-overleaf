import type { McpServer } from "@modelcontextprotocol/server";

import { addressReviewCommentsPrompt } from "./definitions/addressReviewCommentsPrompt.js";
import { prepareArxivSubmissionPrompt } from "./definitions/prepareArxivSubmissionPrompt.js";
import { resolvePushConflictPrompt } from "./definitions/resolvePushConflictPrompt.js";
import { reviewPaperPrompt } from "./definitions/reviewPaperPrompt.js";
import { reviseSectionPrompt } from "./definitions/reviseSectionPrompt.js";
import type { OverleafPrompt, PromptToolGroups } from "./overleafPrompt.js";

// biome-ignore lint/suspicious/noExplicitAny: each prompt narrows its own arguments.
export const OVERLEAF_PROMPTS: readonly OverleafPrompt<any>[] = [
  reviewPaperPrompt,
  reviseSectionPrompt,
  addressReviewCommentsPrompt,
  resolvePushConflictPrompt,
  prepareArxivSubmissionPrompt,
];

export function registerOverleafPrompts(server: McpServer, groups: PromptToolGroups): void {
  for (const prompt of OVERLEAF_PROMPTS) {
    if (!prompt.isOffered(groups)) continue;
    server.registerPrompt(
      prompt.name,
      { title: prompt.title, description: prompt.description, argsSchema: prompt.argumentsSchema },
      (promptArguments) => ({
        messages: [
          {
            role: "user" as const,
            content: { type: "text" as const, text: prompt.buildText(promptArguments, groups) },
          },
        ],
      }),
    );
  }
}
