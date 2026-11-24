import type { OverleafWebClient } from "../../../../overleaf/web/overleafWebClient.js";
import { describeAccessLevel } from "../../../reading/accessLevelNames.js";
import type { ToolContext } from "../../../toolContext.js";
import { findTargetProject, type TargetProject } from "../findTargetProject.js";

export async function requireOwnedProject(
  context: ToolContext,
  webClient: OverleafWebClient,
  project: string | undefined,
): Promise<TargetProject> {
  const target = await findTargetProject(context, webClient, project);
  if (target.listed?.accessLevel === "owner") return target;
  const access = target.listed
    ? `this account ${describeAccessLevel(target.listed.accessLevel)} it`
    : "this account's project list does not include it";
  throw new Error(
    `Only the owner of ${target.label} can change who it is shared with, and ${access}. Nothing was sent.`,
  );
}
