/**
 * The parts of Overleaf's project description that are not the file tree: who is in the project,
 * whose typing becomes suggestions, and the compile settings, all from
 * `ProjectEditorHandler.buildProjectModelView`. The owner is described like a member
 * (`buildUserModelView`: `_id`, `first_name`, `last_name`, `email`), except to a user who reached
 * the project through a read-only link, who gets only the owner's id and no members.
 *
 * `trackChangesState` is there only when the owner's plan has the feature (`features.trackChanges`),
 * as the project's `track_changes || false`. `ProjectHelper.isTrackChangesEnabledForUser` reads
 * `true` as on for everyone and otherwise looks the user id up in the map; the editor keeps
 * anonymous link editors under `__guests__` in the same map.
 */

export interface OverleafTrackChangesState {
  readonly onForEveryone: boolean;
  readonly onForUserIds: readonly string[];
  /** Every user id the state names, on or off; the editor sends all of them back on a change. */
  readonly namedUserIds: readonly string[];
  readonly onForGuests: boolean;
}

export interface OverleafProjectDetails {
  readonly ownerId: string | undefined;
  /** First and last name, when Overleaf described the owner to this account. */
  readonly ownerName: string | undefined;
  readonly ownerEmail: string | undefined;
  readonly memberIds: readonly string[];
  /** False when the owner's plan has no track changes, so there is no switch to turn. */
  readonly trackChangesAvailable: boolean;
  readonly trackChanges: OverleafTrackChangesState;
  readonly compiler: string | undefined;
  /** Such as "texlive-full:2025.1". */
  readonly texLiveImage: string | undefined;
  readonly spellCheckLanguage: string | undefined;
}

const GUESTS_KEY = "__guests__";

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readUserId(user: unknown): string | undefined {
  return user && typeof user === "object" ? readString((user as { _id?: unknown })._id) : undefined;
}

function readUserField(user: unknown, field: "first_name" | "last_name" | "email"): string | undefined {
  return user && typeof user === "object" ? readString((user as Record<string, unknown>)[field]) : undefined;
}

function readUserName(user: unknown): string | undefined {
  const name = [readUserField(user, "first_name"), readUserField(user, "last_name")]
    .filter(Boolean)
    .join(" ");
  return readString(name);
}

function readTrackChangesState(value: unknown): OverleafTrackChangesState {
  if (value === true) return { onForEveryone: true, onForUserIds: [], namedUserIds: [], onForGuests: true };
  const entries = value && typeof value === "object" ? Object.entries(value as Record<string, unknown>) : [];
  const users = entries.filter(([key]) => key !== GUESTS_KEY);
  return {
    onForEveryone: false,
    onForUserIds: users.filter(([, on]) => on === true).map(([userId]) => userId),
    namedUserIds: users.map(([userId]) => userId),
    onForGuests: entries.some(([key, on]) => key === GUESTS_KEY && on === true),
  };
}

export function readProjectDetails(payload: unknown): OverleafProjectDetails {
  const project = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const members = Array.isArray(project.members) ? project.members : [];
  const features = (project.features && typeof project.features === "object" ? project.features : {}) as {
    trackChanges?: unknown;
  };
  return {
    ownerId: readUserId(project.owner),
    ownerName: readUserName(project.owner),
    ownerEmail: readUserField(project.owner, "email"),
    memberIds: members.flatMap((member) => readUserId(member) ?? []),
    trackChangesAvailable: features.trackChanges === true,
    trackChanges: readTrackChangesState(project.trackChangesState),
    compiler: readString(project.compiler),
    texLiveImage: readString(project.imageName),
    spellCheckLanguage: readString(project.spellCheckLanguage),
  };
}

/** Everyone `setTrackChangesForEveryone` should name: owner, members, and users the state names. */
export function everyKnownUserId(details: OverleafProjectDetails): string[] {
  return [
    ...new Set([
      ...(details.ownerId ? [details.ownerId] : []),
      ...details.memberIds,
      ...details.trackChanges.namedUserIds,
    ]),
  ];
}
