# Related projects and capability comparison

Reviewed on 2026-09-08 against these source snapshots:

- [mjyoo2/OverleafMCP — 0ebe2ff](https://github.com/mjyoo2/OverleafMCP/tree/0ebe2ffc839179125e64a679bc402af57beab046)
- [Junfei-Z/overleaf-git-mcp — 961023f](https://github.com/Junfei-Z/overleaf-git-mcp/tree/961023f8066ae521785f9648fda0c705a0afe9d6)
- [AllanVester/Overleaf-MCP-Server — c0b229b](https://github.com/AllanVester/Overleaf-MCP-Server/tree/c0b229bc1598bbabf54b888dc8c0c91385b88140)

The first two were inspected as source code; the browser project was compared from its
README. This server's side of every comparison below was brought up to date on 2026-11-17;
the peers were not reviewed again then, so what is said about them describes those
snapshots. Their servers were not run against live accounts. This is a capability comparison,
not a performance benchmark or an independent security audit. Implementations here were
written independently, without copying competitor code.

## Git bridge capabilities

The table covers the union of the two Git servers' advertised tools and configuration
features. Names and defaults differ; this server is not a drop-in protocol replacement.

| Capability | OverleafMCP | overleaf-git-mcp | This server |
| --- | --- | --- | --- |
| Multiple projects | Yes | Yes | `list_projects`, aliases and raw IDs |
| Project-specific credentials | JSON tokens | JSON tokens | JSON tokens or independent token files |
| Portable token/config files | Environment and user config | JSON beside the script | Explicit absolute paths and user config |
| Single-project environment setup | Yes | JSON | `OVERLEAF_PROJECT_ID` and optional name |
| List files by extension | Yes | Yes | `list_files`, all kinds by default |
| New local files in inventory | Workspace walk | Workspace walk | `includeUntracked: true` |
| Read complete files | `read_file` | `read_file`, full mode | `read_file`, also line ranges |
| Incremental reads | — | Smart mode | Explicit revision baseline, full fallback |
| List/read LaTeX sections | `get_sections`, `get_section_content` | Same names | `list_sections`, `read_section` |
| Replace a section | `write_section` | — | `edit_section` |
| Write/create files | `write_file` | `write_file` | `write_file` |
| Delete and rename files | — | — | `delete_file`, `move_file` |
| Exact text patch | — | `patch_file` | `replace_text`, unique or explicit all |
| Publish changes | Automatic after writes | `push_changes` | Explicit `push_changes` |
| File/main/section summary | `status_summary` | `status_summary` | `project_summary` |
| Local changes in summary | — | Yes | Diff statistics and untracked files |
| Sparse text checkout | — | Yes | Opt-in, safe expansion for compilation |
| npm command | `@mjyoo2/overleaf-mcp` | Source command documented | Verified package candidate; publication is separate |

Migration requires renaming arguments such as `projectName` → `project`, `filePath` →
`path`, `oldText/newText` → `findText/replaceWith`, and `message` → `commitMessage`.
Section and summary tool names map as shown above. Existing project JSON entries with
`projectId`, `gitToken`, and optional `name` can be selected with `OVERLEAF_PROJECTS_CONFIG`.
See [configuration and revision protocol](project-workflows.md) for precedence and limits.

Some defaults deliberately differ. Edits always stay local until a separate push, config
is not discovered inside an arbitrary working directory, and sparse checkout is opt-in.
Incremental reads use JSON line replacements and require the caller's own baseline.
These are equivalent user capabilities with different interfaces and review steps.

## Where the implementations differ

In the inspected [OverleafMCP implementation](https://github.com/mjyoo2/OverleafMCP/blob/0ebe2ffc839179125e64a679bc402af57beab046/overleaf-mcp-server.js),
writes commit and push immediately. Its clone command embeds the credential in the remote
URL, and its pull error path attempts cloning. This server separates edit/review/push,
passes credentials through an environment-backed helper, and preserves the existing clone
when synchronization fails. These observations do not establish a live exploit in a peer.

The inspected [overleaf-git-mcp implementation](https://github.com/Junfei-Z/overleaf-git-mcp/blob/961023f8066ae521785f9648fda0c705a0afe9d6/overleaf-mcp-server.js)
constructs a new client for each tool call while keeping smart-read hashes on the client
instance. That suggests repeated calls cannot reuse the advertised cache; this is a source
inference, not a measured runtime result. Its diff branch compares against `HEAD~1`.
Our tests reconstruct the exact caller baseline across multiple commits and local edits,
and require full content after a restart or unavailable baseline.

This server additionally provides project search, local compilation, pending-work review,
explicit recovery, authenticated Streamable HTTP, locks shared across processes, path and
symlink containment, and optional revision checks before edits. It also browses history
(`list_history`, `show_diff` and `read_file` at any revision), restores a file from an
earlier revision, uploads binary files, follows `\input` and `\include` across a document,
checks labels, citations and included files from the source (`check_references`), and looks
bibliography entries up at doi.org, Crossref and arXiv (`verify_citations`). Source and installed-package
tests exercise these requirements. The inspected Git peer trees contain no comparable
automated test suites; that does not prove their behavior fails in production.

Evidence in this repository:

- `tests/integration/protocol/gitFeatureParity.test.ts`: both transports, revisions,
  guarded edits, inventories, summaries, credential files and raw-ID selection.
- `tests/integration/sparseCheckout.test.ts`: untouched binary assets after a push,
  dirty-tree preservation, restart behavior, and real compilation after expansion.
- `tests/tools/reading/fileRevisions.test.ts`: exact reconstruction, newline boundaries,
  per-file scope, eviction and truncated-response handling.
- `tests/integration/recovery/`: failed pushes, unavailable remotes and concurrent clients.
- `scripts/release/verifyPackage.mjs`: every integration suite against the installed archive,
  repeatable builds, package allowlist, dependency audit and runtime SBOM.

## Boundaries

The [browser project](https://github.com/AllanVester/Overleaf-MCP-Server/tree/c0b229bc1598bbabf54b888dc8c0c91385b88140)
documents browser login, live project discovery, comments/replies/resolution, review-mode
controls, tracked suggestions and screenshots. Git cannot expose that editor state, so here
it needs the optional session cookie. With one, comments, replies and resolution, tracked
suggestions and live project discovery (`list_account_projects`) are implemented. Browser
login, switching the editor's review mode and screenshots are not, and browser login will
not be: a password is a broader credential than this server is willing to hold.

### Servers that do not use the Git bridge

Reviewed on 2026-09-11 from published npm metadata and READMEs. Neither was run, and
neither was read as source, so these are their own claims rather than verified behaviour.

[`@netique/overleaf-mcp`](https://github.com/netique/overleaf-mcp) drives Overleaf's
Socket.IO web API with a captured session cookie. It documents `list_tracked_changes`,
`accept_changes` and `reject_changes`, so its edits can land as review suggestions rather
than as text, and it reads review-panel comments. Its README states plainly that Git-bridge
writes bypass tracked changes even when track-changes mode is on, which is correct.

This server now does the same thing over the same protocol, as of the tracked-changes tools
described in [Tracked changes](tracked-changes.md): `suggest_edit` sets `meta.tc` on an
editor operation, so the edit arrives in the review panel, and `list_tracked_changes` reads
the suggestions and comment anchors back. `accept_tracked_changes` and
`reject_tracked_changes` decide suggestions, and `list_comments` reads the messages inside
each thread. Those messages come from routes whose server side is not in Overleaf's
open-source tree, so they follow the requests the open-source editor sends rather than a
published contract.

Because it authenticates as a browser session throughout, that peer also does not need the
Git bridge, and therefore does not need the project owner's paid subscription. Here the
session cookie turns on thirteen tools and the other twenty-three still go through the
bridge. The cookie tools also find the project through the same Git configuration today, so
the subscription requirement is unchanged for every tool.

[`@youzhijc/overleaf-paper-mcp`](https://www.npmjs.com/package/@youzhijc/overleaf-paper-mcp)
automates a browser session. It documents creating projects, uploading a ZIP, creating
folders, renaming and deleting files, and downloading the compiled PDF. Renaming and
deleting now exist here as `move_file` and `delete_file`, which go through the Git bridge
like every other edit and are therefore local until `push_changes`. With a session cookie,
`create_project` creates a project and `compile_on_overleaf` can save the compiled PDF.
Uploading a ZIP as a new project does not exist here; `upload_file` adds single files. It reads `OVERLEAF_EMAIL` and
`OVERLEAF_PASSWORD` from the environment, which is a materially different credential
exposure from a scoped Git token.

So this server is not a superset of everything available. It is the most complete of the
Git-bridge servers, and the trade is deliberate: the Git bridge is what makes a conflicting
co-author edit detectable and a push refusable. Of the capabilities that needed a second,
non-Git integration, tracked-change suggestions, accepting and rejecting them, and reading
and answering comment threads are now implemented; working without a paid plan is not. From
the browser-automation list, renaming and deleting a file, creating a project and
downloading the compiled PDF are now covered; uploading an archive as a project and
creating an empty folder on its own are not.

Release validation covers macOS and Linux, not Windows. Git integration requires a qualifying
Overleaf account; local compilation requires TeX. There are no latency, bandwidth or user
study results establishing overall superiority, and npm publication remains distinct from
having a tested release candidate. The defensible advantage is a broader verified Git
workflow with explicit safeguards and recovery, not a claim of being best in every setting.
