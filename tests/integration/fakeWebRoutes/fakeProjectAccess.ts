import type { FakeOverleafAccount } from "../fakeOverleafAccount.js";
import type { FakeOverleafRealtime } from "../fakeOverleafRealtime.js";

/**
 * The checks `AuthorizationMiddleware` makes, against the fake's access levels: the real-time
 * fake's `permissionsLevel` for its own project, the dashboard list for the others. A project the
 * account cannot open has no level, which every check refuses with 403 as Overleaf does.
 */

export type FakeAccessLevel = "owner" | "readAndWrite" | "review" | "readOnly";

const RANKS: Record<FakeAccessLevel, number> = { readOnly: 1, review: 2, readAndWrite: 3, owner: 4 };

export class FakeProjectAccess {
  constructor(
    private readonly realtime: FakeOverleafRealtime,
    private readonly account: FakeOverleafAccount,
  ) {}

  levelFor(projectId: string): FakeAccessLevel | undefined {
    if (projectId === this.realtime.projectId) return this.realtime.permissionsLevel;
    const project = this.account.projects.find((candidate) => candidate._id === projectId);
    if (!project) return undefined;
    // The dashboard calls an invited editor readWrite; the editor itself calls the level readAndWrite.
    return project.accessLevel === "readWrite" ? "readAndWrite" : (project.accessLevel as FakeAccessLevel);
  }

  canRead(projectId: string): boolean {
    return this.levelFor(projectId) !== undefined;
  }

  canWrite(projectId: string): boolean {
    return this.atLeast(projectId, "readAndWrite");
  }

  isOwner(projectId: string): boolean {
    return this.levelFor(projectId) === "owner";
  }

  private atLeast(projectId: string, required: FakeAccessLevel): boolean {
    const level = this.levelFor(projectId);
    return level !== undefined && RANKS[level] >= RANKS[required];
  }
}
