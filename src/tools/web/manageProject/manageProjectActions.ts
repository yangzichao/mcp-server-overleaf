import type { InputRequiredResult } from "@modelcontextprotocol/server";

import { requireArgument, type ToolOperation } from "../../actions/toolOperations.js";
import type { PersonConfirmation } from "../../personConfirmation/personConfirmation.js";
import type { ToolContext, ToolTextResult } from "../../toolContext.js";
import { copyProjectAction } from "../projectActions/copyProjectAction.js";
import { createProjectAction } from "../projectActions/createProjectAction.js";
import { createProjectFromZipAction } from "../projectActions/createProjectFromZipAction.js";
import { downloadProjectZipAction } from "../projectActions/downloadProjectZipAction.js";
import {
  moveProjectBetweenListsAction,
  type ProjectListMove,
} from "../projectActions/moveProjectBetweenListsAction.js";
import { renameProjectAction } from "../projectActions/renameProjectAction.js";
import { inviteToProjectAction } from "../projectActions/sharing/inviteToProjectAction.js";
import { removeMemberAction } from "../projectActions/sharing/removeMemberAction.js";
import { revokeInviteAction } from "../projectActions/sharing/revokeInviteAction.js";
import { setMemberAccessAction } from "../projectActions/sharing/setMemberAccessAction.js";
import { tagProjectAction, untagProjectAction } from "../projectActions/tagProjectActions.js";
import { updateSettingsAction } from "../projectActions/updateSettingsAction.js";
import { readSpellCheckLanguage } from "../projectSettings/requestedProjectSettings.js";
import type { ManageProjectInput, ProjectActionName } from "./manageProjectInput.js";

type ManageProjectOperation = ToolOperation<ManageProjectInput, ToolTextResult | InputRequiredResult>;

export function manageProjectActions(
  context: ToolContext,
  confirmation: PersonConfirmation,
): Record<ProjectActionName, ManageProjectOperation> {
  const listMove = (move: ProjectListMove): ManageProjectOperation => ({
    uses: ["project"],
    run: (input) => moveProjectBetweenListsAction(context, move, input.project),
  });

  return {
    create: {
      uses: ["name", "template"],
      run: (input) =>
        createProjectAction(
          context,
          requireArgument(input.name, "name", "create"),
          input.template ?? "blank",
        ),
    },
    create_from_zip: {
      uses: ["sourcePath", "name"],
      run: (input) =>
        createProjectFromZipAction(
          context,
          requireArgument(input.sourcePath, "sourcePath", "create_from_zip"),
          input.name,
        ),
    },
    copy: {
      uses: ["project", "name"],
      run: (input) => copyProjectAction(context, input.project, requireArgument(input.name, "name", "copy")),
    },
    rename: {
      uses: ["project", "name"],
      run: (input) =>
        renameProjectAction(context, input.project, requireArgument(input.name, "name", "rename")),
    },
    archive: listMove("archive"),
    unarchive: listMove("unarchive"),
    trash: listMove("trash"),
    untrash: listMove("untrash"),
    tag: {
      uses: ["project", "tag"],
      run: (input) => tagProjectAction(context, input.project, requireArgument(input.tag, "tag", "tag")),
    },
    untag: {
      uses: ["project", "tag"],
      run: (input) => untagProjectAction(context, input.project, requireArgument(input.tag, "tag", "untag")),
    },
    update_settings: {
      uses: ["project", "compiler", "rootDocument", "spellCheckLanguage", "texLiveImage", "trackChanges"],
      run: (input) =>
        updateSettingsAction(context, input.project, {
          compiler: input.compiler,
          rootDocument: input.rootDocument,
          spellCheckLanguage: readSpellCheckLanguage(input.spellCheckLanguage),
          texLiveImage: input.texLiveImage,
          trackChanges: input.trackChanges,
        }),
    },
    download_zip: {
      uses: ["project", "saveTo"],
      run: (input) =>
        downloadProjectZipAction(
          context,
          input.project,
          requireArgument(input.saveTo, "saveTo", "download_zip"),
        ),
    },
    invite: {
      uses: ["project", "email", "accessLevel"],
      run: (input) =>
        inviteToProjectAction(
          context,
          confirmation,
          input.project,
          requireArgument(input.email, "email", "invite"),
          requireArgument(input.accessLevel, "accessLevel", "invite"),
        ),
    },
    set_access: {
      uses: ["project", "email", "accessLevel"],
      run: (input) =>
        setMemberAccessAction(
          context,
          confirmation,
          input.project,
          requireArgument(input.email, "email", "set_access"),
          requireArgument(input.accessLevel, "accessLevel", "set_access"),
        ),
    },
    remove_member: {
      uses: ["project", "email"],
      run: (input) =>
        removeMemberAction(context, input.project, requireArgument(input.email, "email", "remove_member")),
    },
    revoke_invite: {
      uses: ["project", "email"],
      run: (input) =>
        revokeInviteAction(context, input.project, requireArgument(input.email, "email", "revoke_invite")),
    },
  };
}
