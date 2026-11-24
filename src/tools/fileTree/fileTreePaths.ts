import { normaliseTreePath } from "../../overleaf/realtime/overleafTreeEntities.js";

/**
 * A path in Overleaf's file tree, as a tool argument gives it: "./figures/plot.png" and
 * "figures//plot.png" name figures/plot.png. The empty path is the project's root folder, which
 * no action may create, replace or remove.
 */
export function requireTreePath(path: string, argumentName: string): string {
  const normalised = normaliseTreePath(path.trim());
  if (normalised === "") {
    throw new Error(
      `${argumentName} must name a file or folder inside the project, for example figures/plot.png; the project's root folder cannot be changed.`,
    );
  }
  return normalised;
}
