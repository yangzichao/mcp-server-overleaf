# Related projects and capability comparison

On 2026-11-22, 89 Overleaf MCP servers and Overleaf tools for AI agents were found on GitHub
and npm. 72 of them were reviewed from their READMEs and from the tool definitions in their
source; 17 were skipped. None was cloned or run, so what follows describes what each one
documents and registers, not tested behaviour. Implementations here were written
independently, without copying competitor code.

The table groups what the reviewed servers offer, names a few that offer each capability,
and says how this server covers it. Tool names refer to [the tools](../README.md#the-tools).

| Capability | Seen in, for example | Here |
| --- | --- | --- |
| Read, search and edit over the Git bridge | mjyoo2/OverleafMCP, fly233338/overleaf-mcp, Michael-Tanzer/overleaf-mcp | `read_project`, `read_file`, `search_project`, `edit_file`, with edits local until `push_changes` |
| Refuse to overwrite a co-author's conflicting change | 2sandy-glitch/overleaf-mcp, mhmdaskari/overleaf-web-mcp, EthanRodrigues001/moss | `push_changes` stops and shows both versions |
| Work without Git integration, on a session cookie | DanielHou315/overleaf-mcp-rt, netique/overleaf-mcp, aloth/olcli | 13 of the 15 tools work on a cookie alone |
| Tracked-change suggestions, accepting and rejecting them | netique/overleaf-mcp, Firefox2100/overleaf-mcp, mhmdaskari/overleaf-web-mcp | `manage_tracked_changes`: an exact snippet, a whole section or a whole file |
| Comment threads, and editing or deleting one message | netique/overleaf-mcp, vvbbnn00/overleaf-mcp | `read_review`, `manage_comments` |
| Comment-driven agent tasks (`#agent`) | nipdep/agent-overleaf-connector, ayghri/overleaf-mcp | the `address_review_comments` prompt and a plugin skill |
| Create, copy, rename, archive and trash projects | DanielHou315/overleaf-mcp-rt, n-qber/unofficial-overleaf-mcp-server, darshdevlab/OverleafMCP | `manage_project`; permanent deletion is not offered |
| A new project from a ZIP | darshdevlab/OverleafMCP, mhmdaskari/overleaf-web-mcp, ajmainapon/OverleafMCP | `manage_project` (action `create_from_zip`) |
| Folders, and file-tree changes without Git | netique/overleaf-mcp, wtdcode/overleaf-mcp, MarcoDotIO/overleaf-latex | `manage_files`: `create_folder`, `upload_folder`, and delete, move and upload over the editor |
| Project settings and the track-changes switch | Firefox2100/overleaf-mcp, mhmdaskari/overleaf-web-mcp, gradusnikov/overleaf-mcp | `manage_project` (action `update_settings`) |
| Tags, and archived or trashed listings | darshdevlab/OverleafMCP, mhmdaskari/overleaf-web-mcp, vvbbnn00/overleaf-mcp | `list_projects` filters, `manage_project` (actions `tag`, `untag`) |
| Compile on Overleaf, with outputs beyond the PDF | DanielHou315/overleaf-mcp-rt, wtdcode/overleaf-mcp, deepghs/overleaf-mcp | `compile_project` (`where: "overleaf"`): PDF, log, `.bbl`, `.blg`, SyncTeX file |
| Compile locally | elias-ramzi/WebLatexMCP, 2sandy-glitch/overleaf-mcp, EthanRodrigues001/moss | `compile_project` with latexmk |
| Members of a project | netique/overleaf-mcp, n-qber/unofficial-overleaf-mcp-server, vvbbnn00/overleaf-mcp | `read_project` (view `members`) |
| Inviting, changing access and removing members | gradusnikov/overleaf-mcp, n-qber/unofficial-overleaf-mcp-server, Firefox2100/overleaf-mcp | `manage_project` (actions `invite`, `set_access`, `remove_member`, `revoke_invite`), for the owner; inviting and raising access wait for the user to confirm in the MCP client |
| Word count | MarvelCollin/overleaf-claude-mcp, oscardvs/vibetex, Firefox2100/overleaf-mcp | `read_project` (view `word_count`) |
| Figures as images the model can see | DanielHou315/overleaf-mcp-rt, MarvelCollin/overleaf-claude-mcp, gradusnikov/overleaf-mcp | `read_file` on a PNG, JPEG, GIF or WebP file |
| Flatten `\input` and `\include` | oscardvs/vibetex, mhmdaskari/overleaf-web-mcp, yasaminfayyaz/milatexai | `read_file` with `followIncludes`, and latexpand in a skill |
| Find a reference and get its BibTeX | oscardvs/vibetex, NHagar/overleaf-mcp, elias-ramzi/WebLatexMCP | `look_up_citations` (action `find`) |
| Check that bibliography entries name real works | rangehow/overleaf-mcp, un-seen/overleaf-mcp (hosted, closed source) | `look_up_citations` (action `verify`) |
| Undefined or unused labels and citations | elias-ramzi/WebLatexMCP, nomanfoundhere/overleaf-mcp, yasaminfayyaz/milatexai | `check_references`, without compiling |
| History, diffs and blame | Michael-Tanzer/overleaf-mcp, elias-ramzi/WebLatexMCP | `read_history` (views `commits`, `diff`, `blame`), `manage_files` (action `restore`) |
| Lint and format with chktex and latexindent | oscardvs/vibetex, ghostiee-11/overleaf-mcp, EthanRodrigues001/moss | a plugin skill |
| A latexdiff PDF | aloth/olcli, yasaminfayyaz/milatexai | a plugin skill |
| An arXiv package | oscardvs/vibetex, mhmdaskari/overleaf-web-mcp, yasaminfayyaz/milatexai | the `prepare_arxiv_submission` prompt and a plugin skill |
| PDF pages and SyncTeX | EthanRodrigues001/moss, elias-ramzi/WebLatexMCP, MiiKiyoshi/tex-mcp-web | a plugin skill, and the SyncTeX file `compile_project` saves |
| MCP prompts and plugin skills | oscardvs/vibetex, mhmdaskari/overleaf-web-mcp, igorilic/latex-agentic | 5 prompts and 5 skills |
| Self-hosted Overleaf | DanielHou315/overleaf-mcp-rt, netique/overleaf-mcp, aloth/olcli | one instance per server, through `OVERLEAF_GIT_BASE_URL` and `OVERLEAF_WEB_BASE_URL` |

## Not offered, on purpose

- **Browser login, a stored password, or a cookie scraped from a browser profile**
  (aloth/olcli, netique/overleaf-mcp, DanielHou315/overleaf-mcp-rt and others). A password or
  a whole browser profile is a broader credential than this server is willing to hold. It
  takes a Git token, a session cookie you copy, or both.
- **Sharing on the model's word alone, and transferring ownership.** Paper text, comments
  and compile logs reach the model, so a prompt hidden in a paper must not be able to give
  someone else access. `manage_project` invites someone, or gives a member more access, only
  after the MCP client asks the user through elicitation and they confirm. A client without
  elicitation is pointed to the Share dialog, which also transfers ownership and turns on
  sharing links.
- **Permanent project deletion.** `manage_project` moves a project to the trash, from which
  Overleaf can restore it.
- **Merging a conflicting push automatically.** The point of the Git route is that a
  conflict stops the push; the `resolve_push_conflict` prompt drafts a merge for the user to
  approve.
- Narrow features outside a paper's workflow, such as editor screenshots, AI-detection,
  Markdown-to-LaTeX writers and figure generators.

## Not offered yet

- Overleaf's own web history without Git: labels, a file at a version, a ZIP at a version.
  With Git, `read_history` and `read_file` cover history.
- A feed of collaborators' changes as they happen.
- Linked files imported from a URL.
- Several Overleaf hosts from one server process.
- OAuth for the Streamable HTTP transport; it takes a bearer token today.
- MCP resources, and the list of users online in a project.
- Reverting a whole commit; `manage_files` restores one file at a time.

## Where the Git-bridge implementations differ

These observations come from source snapshots taken on 2026-09-08:
[mjyoo2/OverleafMCP at 0ebe2ff](https://github.com/mjyoo2/OverleafMCP/tree/0ebe2ffc839179125e64a679bc402af57beab046)
and
[Junfei-Z/overleaf-git-mcp at 961023f](https://github.com/Junfei-Z/overleaf-git-mcp/tree/961023f8066ae521785f9648fda0c705a0afe9d6).

In the inspected OverleafMCP implementation, writes commit and push immediately. Its clone
command embeds the credential in the remote URL, and its pull error path attempts cloning.
This server separates editing, review and pushing, passes credentials through an
environment-backed helper, and preserves the existing clone when synchronization fails.
These observations do not establish a live exploit in a peer.

The inspected overleaf-git-mcp implementation constructs a new client for each tool call
while keeping smart-read hashes on the client instance, which suggests repeated calls cannot
reuse the advertised cache; this is a source inference, not a measured runtime result. Its
diff branch compares against `HEAD~1`. Our tests reconstruct the exact caller baseline across
multiple commits and local edits, and require full content after a restart or an unavailable
baseline.

Migrating from those servers means renaming arguments such as `projectName` to `project`,
`filePath` to `path`, `oldText`/`newText` to `findText`/`replaceWith`, and `message` to
`commitMessage`. Their section tools map to `read_project` (view `outline`), `read_file`
with `sectionTitle`, and `edit_file` (action `replace_section`). Existing project JSON
entries with `projectId`, `gitToken`, and an optional `name` can be selected with
`OVERLEAF_PROJECTS_CONFIG`. See [configuration and revision protocol](project-workflows.md).

Evidence in this repository:

- `tests/integration/protocol/gitFeatureParity.test.ts`: both transports, revisions,
  guarded edits, inventories, summaries, credential files and raw-ID selection.
- `tests/integration/sparseCheckout.test.ts`: untouched binary assets after a push,
  dirty-tree preservation, restart behavior, and real compilation after expansion.
- `tests/integration/recovery/`: failed pushes, unavailable remotes and concurrent clients.
- `tests/integration/protocol/toolCatalogByConfiguration.test.ts`: which tools each
  credential offers, and that every one is a read or a write.
- `scripts/release/verifyPackage.mjs`: every integration suite against the installed archive,
  repeatable builds, package allowlist, dependency audit and runtime SBOM.

## Limits of this comparison

Release validation covers macOS and Linux, not Windows. Git integration depends on the
project owner's Overleaf plan; local compilation requires TeX. The session-cookie writes
added in 0.5.0 are tested against fakes built from Overleaf's open-source routes and have not
yet been run against overleaf.com; their reads were run there once, on 2026-11-23. See
[tracked changes](tracked-changes.md#verification).
There are no latency, bandwidth or user-study results establishing overall superiority. The
defensible advantage is a broad, tested workflow with explicit safeguards and recovery, not a
claim of being best in every setting.
