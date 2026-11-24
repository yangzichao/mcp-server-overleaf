/** What manage_project tells a client, action by action. */
export const MANAGE_PROJECT_DESCRIPTION = [
  "Create, copy, rename, file away, tag, configure or download Overleaf projects in the signed-in account; action picks what.",
  "create makes a new project, blank (a minimal main.tex) or from Overleaf's example paper; create_from_zip makes one from a ZIP file on this computer, named after the file unless name is given; copy makes a copy of project, owned by this account, called name. Each of these replies with the new project's address, which other tools take as `project`.",
  "rename gives project a new name, which Overleaf allows only its owner; the address stays the same.",
  "archive and trash move project to this account's Archived or Trashed list, and unarchive and untrash bring it back; Overleaf keeps these lists per account, so co-authors see no change, and nothing is deleted.",
  "tag adds project to one of this account's tags, the folders of Overleaf's project list, creating the tag when the account has none by that name; untag takes it out again.",
  "update_settings changes what the editor's settings menu holds: compiler, rootDocument (the main document), spellCheckLanguage, texLiveImage, and trackChanges, which turns track changes on or off for everyone in the project. It needs edit access, refuses a TeX Live image or language this Overleaf does not offer and lists the ones it does, and afterwards opens a fresh connection to the project to check every change, failing with what took and what did not when one is missing.",
  "download_zip saves the whole project as Overleaf holds it now, binary files included, as the editor's Download Source menu does, for archiving or for a submission system such as arXiv; local edits are in it only after push_changes.",
  "Every action except download_zip changes Overleaf at once; the only undo is the opposite action. Projects are never deleted for good here, and sharing is changed only in Overleaf's Share menu.",
  "sourcePath must be an absolute path, outside hidden directories, to a ZIP archive of at most 50 MB; saveTo must be absolute, end in .zip and lie in a directory that exists, and never replaces a file that is not a ZIP. Both are checked before anything is sent or written.",
  "Returns plain text naming the project and saying what changed, or that nothing did because the project was already that way.",
].join(" ");
