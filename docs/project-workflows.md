# Project configuration and efficient reads

## Independent project credentials

Set `OVERLEAF_PROJECTS_CONFIG` to an absolute path outside the installation and workspace.
It accepts the project shape used by both Git-based peers:

```json
{
  "defaultProject": "paper",
  "projects": {
    "paper": {
      "name": "Main Paper",
      "projectId": "64a1b2c3d4e5f6a7b8c9d0e1",
      "gitTokenFile": "/absolute/path/to/paper-token"
    },
    "thesis": {
      "projectId": "65b2c3d4e5f6a7b8c9d0e1f2",
      "gitToken": "olp_replace_locally"
    }
  }
}
```

`name` is a display label; the object key is the tool's `project` argument. A token file
contains only the token, optionally followed by a newline. All token file paths must be
absolute. Keep the JSON and token files private, for example with `chmod 600` on macOS/Linux.
Do not paste credentials into a chat or commit them to Git.

Selection rules, in order:

1. `OVERLEAF_PROJECTS` selects the whole project list. Otherwise `OVERLEAF_PROJECT_ID`
   selects one project, with `OVERLEAF_PROJECT_NAME` as its alias (default `default`).
   These selections ignore JSON configuration entirely, avoiding accidental credential mixing.
2. Otherwise load the explicit `OVERLEAF_PROJECTS_CONFIG` file.
3. With none of those settings and no default token/token-file variable, discover
   `overleaf-mcp/projects.json` under `$XDG_CONFIG_HOME`, Windows `%APPDATA%`, or `~/.config`.
   A configured user-directory variable must be absolute. The current directory and the
   package directory are never searched for `projects.json`.

Within JSON, a project's non-empty `gitToken` wins over its `gitTokenFile`. Projects without
either use `OVERLEAF_GIT_TOKEN`, or `OVERLEAF_GIT_TOKEN_FILE` when no direct token is set.
Every registered project must have a credential. Project names and IDs must be unique.
An alias that itself looks like an Overleaf ID must match its own project's ID.
Selecting a registered project by raw ID uses that project's credential; an unregistered
ID requires a default token and cannot borrow another project's token.

The default is `OVERLEAF_DEFAULT_PROJECT`, then JSON `defaultProject`, then the alias
`default`, then the sole registered project. Otherwise every call must name a project.

`OVERLEAF_MCP_ENV_FILE` still provides an explicit environment file with per-variable
process-environment overrides. Without it, the legacy installation `.env` is loaded only
when the client supplies no project/token settings, including the new file variables.
The resulting environment then follows the selection rules above. To avoid legacy-file
ambiguity, prefer an explicit JSON or environment file in MCP client configuration.

## Sparse checkout

Set `OVERLEAF_MCP_CHECKOUT_MODE=text-only` to materialize LaTeX, bibliography, style,
configuration and common text/data files. Lowercase and uppercase extensions are included.
The default is `full`. Sparse checkout uses Git's non-cone patterns and requires a Git
version supporting `git clone --sparse` and `git sparse-checkout set --no-cone`.
Git's current documentation deprecates non-cone mode. Extension-based selection relies on
it, so this is an optional compatibility feature; retain `full` for the default workflow.

All tracked files remain listed and remain in the repository's history, including pictures.
This reduces the working-tree footprint; it does not promise smaller network downloads or
a smaller Git object database. See [Git's sparse-checkout documentation](https://git-scm.com/docs/git-sparse-checkout).

Reading or writing a path absent from the working tree expands the clone. Compilation
expands all files before running latexmk, so figures and less common input formats remain
available. Expansion preserves local edits and stays in effect across server restarts.
To shrink again, switch to `full`, restart and use the project once, then switch back to
`text-only` on a clean working tree with no ignored local files. Contraction refuses
ignored files too, since Git's sparse operations can remove them. A dirty full checkout cannot be contracted: keep
`full` configured while reviewing and publishing or deliberately discarding pending work.

The sparse files are a working-tree choice, not a sandbox or access-control boundary.

## Revision reads and guarded edits

Existing `read_file` calls return plain text, with optional line ranges. Set `mode: "full"`
for a JSON response containing `kind`, `content`, `revision` and `truncated`. Use
`mode: "smart"` with the `previousRevision` from your own complete read to reduce repeat
output. A revision is the SHA-256 of the exact UTF-8 text returned for that file.

- `kind: "unchanged"`: the supplied baseline still matches; no text is repeated.
- `kind: "delta"`: apply `change` only to the content identified by `baseRevision`.
  Split that content on `\n`, replace `deleteLineCount` entries beginning at the 1-based
  `startLine` with `lines`, then join on `\n`. This preserves blank lines and final newlines.
- `kind: "full"`: replace the baseline with `content`. A full response is used on first
  read, after restart or eviction, for an unknown baseline, or when a delta would be larger.

Example delta application for a client implementing this protocol:

```js
const lines = previousContent.split("\n");
lines.splice(response.change.startLine - 1, response.change.deleteLineCount, ...response.change.lines);
const currentContent = lines.join("\n");
```

Snapshots are scoped to the project/file and bounded to 128 entries and 2,000,000 text
characters per server process. Each caller supplies its own baseline; one HTTP client's
read cannot advance another client's baseline. A delta describes a contiguous changed
line span against that baseline, including changes across multiple commits and local edits.

Revision responses whose JSON-encoded content would exceed 50,000 characters return only
an 8,000-character preview with `truncated: true` and `revision: null`. Never use a preview
as a baseline or reconstruct a whole-file write from it. Read large files using plain-text
line ranges and prefer exact snippet edits. Revision modes cannot be combined with line ranges.

Pass a complete read's `revision` as `expectedRevision` to `write_file`, `replace_text` or
`edit_section`. After synchronization and while holding the project lock, the server
checks the current file before writing. A mismatch refuses the edit without changing
the file. This protects against another client or collaborator changing the file between
read and edit. All successful edits still require explicit `push_changes` to publish.

## Filtering and summaries

`list_files` accepts `extension: "tex"` or `".bib"`, case-insensitively. Omit it to list
all kinds. Set `includeUntracked: true` to include new unpublished files; ignored build
artifacts remain excluded. Sparse files remain visible in the inventory.

`project_summary` returns JSON with total/tracked file counts, category counts, a likely
main document, that document's section count, the first ten files, tracked pending diff
statistics, and all untracked files. `mainFile` is a heuristic, not Overleaf's browser
project setting. Use `project_status` for synchronization state and recent commits, and
`show_diff` for the complete review of unpublished work.
