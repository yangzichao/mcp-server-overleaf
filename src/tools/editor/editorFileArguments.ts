import * as z from "zod/v4";

export const editorPathArgument = z
  .string()
  .describe("Path of the file relative to the project root, for example main.tex or sections/intro.tex.");

/**
 * Said in every description here, because the tool names are the Git-bridge ones and a model
 * that knows those expects a local clone and a push step.
 */
export const NO_GIT_BRIDGE_NOTE =
  "This server has no Git credential, so this works on the live Overleaf editor through the session cookie rather than on a local clone.";
