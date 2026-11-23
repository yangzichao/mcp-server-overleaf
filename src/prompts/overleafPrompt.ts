import type * as z from "zod/v4";

/** Which credentials this server was started with, as far as a prompt needs to know. */
export interface PromptToolGroups {
  readonly gitBridge: boolean;
  readonly sessionCookie: boolean;
}

/**
 * A prompt a user picks from their client's menu, such as `/mcp__overleaf__review_paper` in
 * Claude Code. Each one names only tools this configuration offers, so `isOffered` keeps a
 * prompt out of the list when the tools it relies on are missing.
 */
export interface OverleafPrompt<Arguments extends Record<string, string | undefined>> {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly argumentsSchema: z.ZodType<Arguments>;
  isOffered(groups: PromptToolGroups): boolean;
  buildText(promptArguments: Arguments, groups: PromptToolGroups): string;
}

export function describeProject(project: string | undefined): string {
  return project ? `the Overleaf project ${project}` : "the default Overleaf project";
}

/** Passed as `project` to every tool call, or nothing when the default project is meant. */
export function projectCallHint(project: string | undefined): string {
  return project ? ` Pass project: "${project}" to every tool call.` : "";
}
