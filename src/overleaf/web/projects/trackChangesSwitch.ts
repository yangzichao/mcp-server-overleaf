import { everyKnownUserId, type OverleafProjectDetails } from "../../realtime/overleafProjectDetails.js";
import { requireOverleafId } from "../overleafIds.js";
import type { OverleafWebClient } from "../overleafWebClient.js";
import { RequestNotSentError } from "../overleafWebErrors.js";

/**
 * Turning track changes on or off for everyone in a project, so that what collaborators type
 * in the editor arrives as suggestions. Overleaf keeps the switch per user. The route and bodies
 * are the ones the open-source editor sends from
 * `review-panel/context/track-changes-state-context.tsx`: `POST /project/:id/track_changes` with
 * `{ on_for: { <userId>: boolean } }` naming every member it knows, and a separate
 * `{ on_for_guests: boolean }` for people editing through a link without signing in. The server
 * side lives in a module outside Overleaf's open-source tree, so these requests are the contract.
 *
 * The user ids come from the project details a real-time connection received: the owner, the
 * invited members, and any user the current state already names, since the editor always sends
 * the whole map.
 */
export async function setTrackChangesForEveryone(
  client: OverleafWebClient,
  projectId: string,
  on: boolean,
  details: OverleafProjectDetails,
): Promise<void> {
  const path = `/project/${requireOverleafId(projectId, "Project id")}/track_changes`;
  if (!details.trackChangesAvailable) {
    throw new RequestNotSentError(
      "Track changes is not part of the project owner's Overleaf plan, so there is no switch to turn.",
    );
  }
  const userIds = everyKnownUserId(details).map((userId) => requireOverleafId(userId, "User id"));
  if (userIds.length === 0) {
    throw new RequestNotSentError("Overleaf did not say who is in the project, so no one can be named.");
  }
  await client.postIgnoringAnswer(path, {
    on_for: Object.fromEntries(userIds.map((userId) => [userId, on])),
  });
  await client.postIgnoringAnswer(path, { on_for_guests: on });
}
