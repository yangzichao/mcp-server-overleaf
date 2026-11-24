import type { FakeAccessLevel } from "./fakeProjectAccess.js";

/**
 * Who is in the fake project, described as `ProjectEditorHandler.buildUserModelView` describes a
 * member. The signed-in user owns it unless a test lowers `permissionsLevel`, in which case
 * someone else owns it and the signed-in user is a member at that level.
 */

export interface FakeMember {
  _id: string;
  first_name: string;
  last_name: string;
  email: string;
  privileges: string;
  signUpDate: string;
  pendingEditor?: boolean;
  pendingReviewer?: boolean;
}

export const FAKE_CURRENT_USER_EMAIL = "you@example.com";
export const FAKE_COLLABORATOR_ID = "6500000000000000000000bb";
export const FAKE_REVIEWER_ID = "6500000000000000000000dd";
const FAKE_OTHER_OWNER_ID = "6500000000000000000000cc";

export const FAKE_PENDING_INVITES = [
  { _id: "64a900000000000000000001", email: "invited.coauthor@example.com", privileges: "readAndWrite" },
];

function member(id: string, firstName: string, email: string, privileges: string): FakeMember {
  return {
    _id: id,
    first_name: firstName,
    last_name: "Example",
    email,
    privileges,
    signUpDate: "2025-01-01T00:00:00.000Z",
  };
}

export function fakeOwnerAndMembers(
  currentUserId: string,
  currentLevel: FakeAccessLevel,
): { owner: FakeMember; members: FakeMember[] } {
  const collaborators = [
    member(FAKE_COLLABORATOR_ID, "Ada", "ada@example.com", "readAndWrite"),
    { ...member(FAKE_REVIEWER_ID, "Bea", "bea@example.com", "review"), pendingEditor: false },
  ];
  if (currentLevel === "owner") {
    return { owner: member(currentUserId, "You", FAKE_CURRENT_USER_EMAIL, "owner"), members: collaborators };
  }
  return {
    owner: member(FAKE_OTHER_OWNER_ID, "Olga", "olga@example.com", "owner"),
    members: [member(currentUserId, "You", FAKE_CURRENT_USER_EMAIL, currentLevel), ...collaborators],
  };
}
