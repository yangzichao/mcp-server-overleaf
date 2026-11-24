import type { FakeAccessLevel } from "./fakeProjectAccess.js";
import { FAKE_PENDING_INVITES, type FakeMember, fakeOwnerAndMembers } from "./fakeProjectMembers.js";

export interface FakeInvite {
  _id: string;
  email: string;
  privileges: string;
}

const PRIVILEGES_TAKING_A_SEAT = new Set(["readAndWrite", "review"]);

export class FakeProjectSharing {
  readonly invites: FakeInvite[] = FAKE_PENDING_INVITES.map((invite) => ({ ...invite }));
  readonly removedMemberIds = new Set<string>();
  readonly changedPrivileges = new Map<string, string>();
  /** How many editors and reviewers, members and invitations together, the owner's plan allows. */
  collaboratorSeats: number | undefined;
  /** The addresses with an account, for an Overleaf with `restrictInvitesToExistingAccounts` on. */
  existingAccountEmails: Set<string> | undefined;
  answerInvitesAsBotProtection = false;
  private nextInviteNumber = FAKE_PENDING_INVITES.length + 1;

  ownerAndMembers(
    currentUserId: string,
    currentLevel: FakeAccessLevel,
  ): { owner: FakeMember; members: FakeMember[] } {
    const { owner, members } = fakeOwnerAndMembers(currentUserId, currentLevel);
    return {
      owner,
      members: members
        .filter((member) => !this.removedMemberIds.has(member._id))
        .map((member) => ({
          ...member,
          privileges: this.changedPrivileges.get(member._id) ?? member.privileges,
        })),
    };
  }

  hasFreeSeat(members: readonly FakeMember[]): boolean {
    if (this.collaboratorSeats === undefined) return true;
    const taken = [...members, ...this.invites].filter((entry) =>
      PRIVILEGES_TAKING_A_SEAT.has(entry.privileges),
    ).length;
    return taken < this.collaboratorSeats;
  }

  takesSeat(privileges: string): boolean {
    return PRIVILEGES_TAKING_A_SEAT.has(privileges);
  }

  addInvite(email: string, privileges: string): FakeInvite {
    const invite = { _id: `64a9${String(this.nextInviteNumber).padStart(20, "0")}`, email, privileges };
    this.nextInviteNumber += 1;
    this.invites.push(invite);
    return invite;
  }

  removeInvite(inviteId: string): void {
    const index = this.invites.findIndex((invite) => invite._id === inviteId);
    if (index !== -1) this.invites.splice(index, 1);
  }
}
