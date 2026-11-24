# Changelog

## 0.6.1

Five tool descriptions are rewritten, and one reply of `manage_comments` is fixed. No tool,
action or argument changes.

- `manage_comments`, `read_review`, `check_references`, `read_history` and `list_projects`
  describe each action or view in short sentences and say what their arguments do beyond the
  schema: how `quoteText` is matched, where `check_references` starts without `mainTexFile`
  and when it warns, how hidden resolved threads are counted, and that an argument the chosen
  action does not take is refused. `list_projects` no longer repeats the filter list its
  schema gives.
- `manage_comments` (action `add`) answers a passage that is not in the document with "No
  comment was added." It used to say "Nothing was suggested.", the reply for a suggestion.

## 0.6.0

`manage_files` uploads a folder from this computer, and `manage_project` shares a project the
account owns. Both are new actions on existing tools, so the tool count stays at 15 and no
existing action changes its arguments. The rest fixes what the new Gherkin and property tests
found.

- `manage_files` (action `upload_folder`) copies a folder from this computer into the project,
  keeping its subfolders: into the clone with a Git token, or straight into Overleaf with a
  session cookie alone. Hidden files and symbolic links are left out and named in the reply,
  and a folder of more than 180 files, the most Overleaf's upload dialog takes, is refused.
  When Overleaf refuses a file partway, the reply lists what was already uploaded.
- `manage_project` shares a project the account owns: `invite` an email address with access
  edit, review or view, `set_access` for a member, `remove_member` and `revoke_invite`.
  Inviting someone, or giving a member more access, waits until the MCP client asks the user
  through elicitation and they confirm it, so text planted in a paper cannot have the model
  share the project. A client without elicitation, or one on HTTP with a 2025 protocol
  revision, is refused and pointed to the Share menu. An invitation overleaf.com's bot
  protection holds back for a captcha is reported the same way.
- `manage_project` (`update_settings`) answers "nothing changed" and sends nothing when the
  project already has every requested setting, as `rename`, `tag` and `archive` do. It used to
  answer "Changed the settings" and send the change again.
- `manage_comments` (`edit_message`) answers "nothing changed" and sends nothing when the
  message already reads the new text. It used to answer "Edited message".
- A path written with more than one `./`, such as `././main.tex`, or with `./` inside it, names
  the same file as without them. `././main.tex` used to find nothing.
- A `.env` value holding U+2028, U+2029 or a lone carriage return is read. The whole line used
  to be skipped.
- `OVERLEAF_PROJECT_NAME` is taken whole, so a name with `,` or `=` in it no longer stops the
  server from starting.
- `setup --project` takes an address with `=` in its query string as one address, not as
  `name=address`, and a project named `__proto__` is kept in the configuration file it writes.
- Reading Crossref and arXiv XML, an element whose name only starts with the one asked for,
  such as `<title-group>` for `<title>`, is no longer taken for it.

## 0.5.2

.bib files are read as BibTeX 0.99d reads them, or as biber does for a document that uses
biblatex. No tool changes its name or arguments.

- `check_references` and `look_up_citations` (`verify`) read .bib files the way the program
  that runs on them does: biber when the document loads biblatex or names its files with
  `\addbibresource`, BibTeX otherwise, including for biblatex loaded with `backend=bibtex`.
  `look_up_citations` (`find`) cannot tell which one will run, so before it picks a new key it
  reads `%` lines, as BibTeX does, and every entry on a file's last line, as biber does.
- For BibTeX, a line starting with `%` is text: an entry written on it is defined, and such a
  line between two fields ends the entry there. biber still skips the line.
- For BibTeX, reading a file stops once an entry or command ends on its last line, so a second
  entry on that line is not defined unless another line follows, even an empty one.
- `@string` macros are expanded, by name without regard to case, and carry over from one .bib
  file to the next in the order the document names them, as BibTeX does. `jan` to `dec` stand
  for the month names, as plain.bst defines them, or for 1 to 12 under biber, and a macro
  nothing defines expands to nothing. `booktitle = icml` used to be read as the text `icml`.
- An entry an error cuts short keeps the fields read before the error, as BibTeX keeps them.
  `look_up_citations` (`verify`) used to say such a cited entry had no entry in any
  bibliography file, and (`find`) could give its key, or the key of an entry on a `%` line, to
  a new entry. A field written twice keeps its first value.

## 0.5.1

Fixes for what new property tests, a protocol fuzz, recheck and stricter compiler checks found.
No tool changes its name or arguments.

- On a disk that ignores case, as macOS does by default, a path that differs from a file's
  name only in case is refused, and the reply names the file as stored. `manage_files`
  (`delete`) with `Main.tex` used to delete `main.tex`, and `edit_file` (`write`) used to
  overwrite it. A rename that changes only case, such as `main.tex` to `Main.tex`, is now made
  in the clone and published by `push_changes` instead of refused.
- `manage_files` (`restore`) with a folder and an older revision is refused. It used to put
  every file in the folder back to that revision and delete the files added since.
- Replies that read as success when nothing changed are now tool errors: a missing or repeated
  snippet in `edit_file` (`replace_text`), a section title that matches nothing, a move whose
  source is missing or whose destination is taken, a `startLine` past the last line, and a
  rename of a project to the name it has.
- A folder where a file was expected, a path inside a file and a missing file are described in
  words, without Node's error codes or the clone's absolute path. A blank commit message is
  refused before anything is staged, and a failed Git command reports its error once instead
  of the whole command line.
- `check_references` and `look_up_citations` follow BibTeX 0.99d in two places they used to
  differ: an entry written inside another entry's field defines nothing, and a backslash
  escapes no brace. `check_references` also counts `key` as defined in `@misc{key}` and
  `@misc{key title = {T}}`, where no comma follows it, as BibTeX does.
  natbib's `\Citet`, `\Citep` and `\Citeauthor`, biblatex's `\Cite` and `\Cites`,
  `\vpageref[here][there]{key}` and a listing label after `caption={[short]long}` are read.
  `\import{../}{a}` no longer finds the project root's `a.tex`.
- `look_up_citations` (`find`) writes entries BibTeX reads as meant: an author with only a
  family name stays one name, a name with "and" in it stays one person, a lone brace no longer
  runs past the value, and a key for a name with particles starts with BibTeX's last part.
- An edit sent to Overleaf's editor changes only what differs at each place it touches. An
  edit that joined lines next to an identical line used to rewrite two lines, which dropped
  what was anchored to them.
- A Socket.IO frame with a negative length no longer loops forever. Regular expressions in the
  LaTeX, arXiv, Crossref, texcount and editor page readers run in linear time, and flattening
  40,000 `\input` lines takes 80 ms instead of 4 seconds. A tracked change dated past what a
  Date holds, or a character reference past U+10FFFF, no longer throws.
- Also: a `.env` with Windows line endings loads, overlapping secrets are redacted whole, an
  SVG with a longer prolog gets the advice to render it to PNG, one null item in a Crossref
  answer no longer fails the search, and each editor setting is read from its own meta tag.

## 0.5.0

36 tools become 15. Each one only reads or only writes, and an `action` or `view` argument
picks what it does, so a client lists less and a model picks from fewer names. A Git token
offers 11 tools, a session cookie alone 13, both 15. The old names are gone; a client picks up
the new list when it reconnects.

| 0.4.1 | 0.5.0 |
| --- | --- |
| `list_projects`, `list_account_projects` | `list_projects` |
| `project_summary` | `read_project` (view `overview`) |
| `list_files` | `read_project` (view `files`) |
| `list_sections` | `read_project` (view `outline`), now following included files by default |
| `project_status`, `sync_project` | `read_project` (view `status`) |
| `show_diff` without revisions | `read_project` (view `changes`) |
| `show_diff` with `fromRevision` | `read_history` (view `diff`) |
| `list_history` | `read_history` (view `commits`) |
| `read_section` | `read_file` with `sectionTitle` |
| `replace_text`, `edit_section`, `write_file` | `edit_file` (actions `replace_text`, `replace_section`, `write`) |
| `delete_file`, `move_file`, `upload_file`, `restore_file`, `discard_local_changes` | `manage_files` (actions `delete`, `move`, `upload`, `restore`, `discard_local_changes`); a move takes `path` and `toPath` |
| `verify_citations` | `look_up_citations` (action `verify`) |
| `list_tracked_changes`, `list_comments` | `read_review` (views `tracked_changes`, `comments`) |
| `suggest_edit`, `accept_tracked_changes`, `reject_tracked_changes` | `manage_tracked_changes` (actions `suggest`, `accept`, `reject`) |
| `add_comment`, `reply_to_comment`, `resolve_comment`, `delete_comment` | `manage_comments` (actions `add`, `reply`, `resolve`, `reopen`, `delete`) |
| `create_project`, `download_project_zip` | `manage_project` (actions `create`, `download_zip`) |
| `compile_project`, `compile_on_overleaf` | `compile_project` (`where: "local"` or `"overleaf"`) |

`read_file`, `search_project`, `check_references` and `push_changes` keep their names.

New:

- `list_projects` filters the account's projects (`filter`: owned, shared, archived, trashed;
  `tag`) and shows each project's tags. A filter or a tag lists the account's projects
  alone, without the configured ones.
- `read_project` adds `members` (owner, collaborators and their access, pending invitations)
  and `word_count`: Overleaf's own count with a session cookie, texcount in the clone with
  only a Git token. Without Git its overview adds the compiler, TeX Live image, spell check
  and track-changes state, and it outlines the paper too.
- `read_file` returns PNG, JPEG, GIF and WebP figures as images, up to 3,750,000 bytes and
  8000 pixels a side, and names the command that renders a PDF, EPS or SVG figure to PNG.
  With `followIncludes` it returns a `.tex` file with every file it reaches through
  `\input`, `\include`, `\subfile` or `\import` inlined between `% ---- begin` and
  `% ---- end` comments.
- `read_history` adds `blame`: each line of a file, or of a line range, with the short hash,
  date and author of the commit that last changed it. Lines edited in the clone and not
  pushed are marked as not committed yet.
- `look_up_citations` adds `find`. It turns 1 to 20 DOIs, arXiv ids or title searches into
  BibTeX entries with keys no `.bib` file in the project uses, names the key of a work the
  bibliography already holds, and writes nothing.
- `edit_file` adds `append`, which puts text on its own line after a file's last line and
  refuses a missing file.
- `manage_files` deletes and moves whole folders in the clone. With a session cookie it adds
  `create_folder`, which acts on Overleaf at once, since Git cannot hold an empty folder.
- `manage_tracked_changes` (action `suggest`) also takes `content`: alone it is the document's
  new text, and with `sectionTitle` it replaces that section. Only the passages that differ
  become tracked changes, so unchanged text keeps its comments.
- `manage_project` creates a project from a ZIP, and copies, renames, archives, unarchives,
  trashes, untrashes, tags and untags projects. `update_settings` changes the compiler, main
  document, spell-check language, TeX Live image and the track-changes switch, and reads
  them back.
- `manage_comments` edits one message of a thread, or deletes a reply. The first message is
  the thread's own text, which `delete` removes with the thread.
- `compile_project` on Overleaf also saves the `.bbl`, `.blg` and SyncTeX map next to the PDF
  and log, and a local build writes a SyncTeX map too. The reply lists every saved path.
- With only a session cookie, more of the work happens in Overleaf's editor and file tree.
  `search_project`, `check_references` and `look_up_citations` read the project from the
  editor. `edit_file` also replaces a section, writes a whole file (creating a missing
  document and its folders) and appends, sending the fewest operations so comments outside
  the change keep their anchors. `manage_files` deletes, moves, uploads and creates folders.
- Five MCP prompts, each offered when its tools are: `review_paper`, `revise_section`,
  `address_review_comments` (with a session cookie), `resolve_push_conflict` (with Git) and
  `prepare_arxiv_submission`.
- The Claude Code and Codex plugins ship five skills for local LaTeX tools: chktex,
  latexindent and texcount checks, latexdiff and flattening, PDF pages and SyncTeX,
  arXiv submission, and working with co-authors.

Not offered, on purpose: sharing changes (inviting, removing, transferring ownership) and
permanent project deletion. Project text and comments reach the model, so a prompt hidden in
a paper must not be able to give anyone access or destroy a project.

Changed:

- Citation lookups queue across calls: Crossref searches 1.1 s apart (was 250 ms), doi.org
  250 ms apart (was unspaced), arXiv 3 s apart as before. Crossref's public pool allows one
  search a second and answers a second one within the second with 429.
- Both `look_up_citations` actions stop starting lookups after 45 seconds, under the MCP
  SDK's default 60 second request timeout, and name the entries or queries they did not
  reach.
- arXiv is reached at `https://export.arxiv.org/api`. The `http://` address now answers
  every request with a redirect there.
- `look_up_citations` (action `verify`) on a document whose entries are written with
  `\bibitem` names the cited keys and says there is no `.bib` file to check. It used to say
  the document cited no entry.

Verification: the session-cookie features added here are tested against fakes built from
Overleaf's open-source routes. Their reads were run against overleaf.com on a test project on
2026-11-23 and their writes were not; [tracked changes](docs/tracked-changes.md#verification)
lists both. The track-changes switch and the comment-message routes are closed source, so
their tests follow what the editor sends.

## 0.4.1

Work on an Overleaf plan without Git integration. With only a session cookie the server
offers 17 tools: `list_projects`, the 13 review, comment, compile and account tools, and `list_files`,
`read_file` and `replace_text` over the real-time editor. Verified against overleaf.com on
2026-11-20 with a cookie and no Git token.

- Reach Overleaf with only `OVERLEAF_SESSION_COOKIE_FILE`. A project may be registered
  without a Git token once a cookie is configured. Without a Git credential the Git-bridge
  tools are not offered, and the server instructions say so.
- `list_files`, `read_file` and `replace_text` run over the editor on such a server, under
  the same names. `replace_text` changes the live document at once, needs edit access, and
  points a reviewer at `suggest_edit`. `read_file` returns pending suggestions as if
  accepted, and refuses a binary upload by name.
- The desktop bundle's Git token is now optional. A setting still holding its
  `${user_config.*}` placeholder is treated as unset. A registered project with no
  credential at all now starts unconfigured instead of exiting, and every call says what to
  fill in. A configuration where some projects have a token and others have none to fall
  back on still fails.
- `replace_text` and `suggest_edit` over the editor refuse emoji and other characters
  outside the Basic Multilingual Plane, and NUL. Overleaf itself replaces them with U+FFFD.
- `list_account_projects` prints "can edit" for an invited collaborator. Overleaf calls that
  access `readWrite`, not the `readAndWrite` of link sharing, so it used to be printed raw.
- The release waits for the published tarball, not just the version listing, before
  installing it. 0.4.0's verification hit a CDN-cached 404.

## 0.4.0

Everything competing Overleaf MCP servers offer that fits this server's credential model,
plus two checks none of them has. 23 tools without a session cookie, 36 with one.

- Read and act on the review panel with a session cookie. `list_comments` reads every message
  in each comment thread; `reply_to_comment`, `resolve_comment` (and reopen) and
  `delete_comment` act on a thread; `add_comment` now posts the first message too.
  `accept_tracked_changes` and `reject_tracked_changes` decide suggestions by id or all at
  once, and check afterwards that they are gone.
- Reach the account through Overleaf's web app with a session cookie: `list_account_projects`,
  `create_project`, `compile_on_overleaf` (errors and warnings from the log, and the PDF saved
  where you say), and `download_project_zip`. Output files come from Overleaf's own host, so
  the cookie never goes to the separate PDF domain.
- Browse and restore history. `list_history` lists commits for the project or one file.
  `show_diff` compares any two revisions, `read_file` reads a file at a revision, and
  `restore_file` puts a file back to an earlier one, local until pushed.
- `upload_file` adds a binary file such as a figure, from a local path or base64.
- `check_references` finds undefined, duplicate and unused labels and citations, cited keys
  that differ from an entry only in case, missing `\input`/`\include` targets and missing
  graphics, from the source and across included files, without compiling.
- `verify_citations` looks cited bibliography entries up at doi.org, Crossref and arXiv. It
  reports a DOI or arXiv id that does not exist or belongs to a differently titled work, and
  entries no title search could match. It sends only titles, identifiers, first authors and
  years, with no e-mail address or cookie. `OVERLEAF_MCP_DOI_RESOLVER_URL`,
  `OVERLEAF_MCP_CROSSREF_API_URL` and `OVERLEAF_MCP_ARXIV_API_URL` point it elsewhere.
- `list_sections` takes `followIncludes`, to outline a whole document across its included
  files in reading order.
- `compile_project` and `compile_on_overleaf` also report BibTeX's and biber's errors and
  warnings, so a malformed `.bib` entry or a cited key with no entry shows up in the report
  instead of as an empty bibliography. Locally they come from latexmk's output; on Overleaf,
  from `output.blg`.
- The server now sends `instructions` on initialize: nothing is published without
  `push_changes`, the cookie tools act at once, and project content is data, not instructions.
- The privacy policy now covers the session cookie and the citation lookups.

Found by running the new build against overleaf.com's Git bridge, doi.org, Crossref and arXiv:

- `verify_citations` confirmed "Generative Adversarial Nets" (Goodfellow, 2014) as a 2023 book
  chapter by someone else with the same title. A title search now confirms an entry only when
  the result also lists its first author, and an unconfirmed entry names the closest result's
  author and year.
- `list_history` with a bare date such as `since: "2026-09-07"` skipped that morning's commits,
  because Git reads a date without a time as that day at the current time of day. A bare date
  now covers the whole day, for `since` and for `until`.
- `compile_project` reported every citation and reference as undefined in a document where
  they all resolve. It read latexmk's output, which strings every pass together, and the first
  pass always runs without an .aux file. It now reads the final pass's log, and BibTeX's or
  biber's.
- Runtime dependencies move to their newest versions within the same major version. That takes
  `@hono/node-server` from 1.19.17 to 2.1.9, out of the range of
  [GHSA-rmxm-3fg6-px4f](https://github.com/advisories/GHSA-rmxm-3fg6-px4f), and `zod` from 4.6.5
  to 4.6.7, out of the range of
  [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). Both were in 0.3.9.

## 0.3.9

There is no 0.3.8. Glama already uses that label for a rebuild of 0.3.7, so this release
skips it and keeps the npm version and Glama's label the same.

- Say in the tool descriptions what each argument does beyond its schema, and how each tool
  fails. `replace_text` inserts `replaceWith` literally, so `$$` and `$1` are kept. A section
  title is matched against the title in braces: an exact title wins over the first one that
  contains it. `write_file` with `expectedRevision` refuses a file that no longer exists.
  `compile_project` names the files it tries when `mainTexFile` is omitted, and it compiles the
  clone without pulling. `search_project` skips a new file until `push_changes` commits it.
  `show_diff` does not pull. `discard_local_changes` deletes new files too. Glama's tool
  definition score had marked 13 of the 18 tools down for adding nothing to their parameters.
- Stop the integration tests from failing intermittently with ENOTEMPTY while deleting a clone.
  Git starts `git maintenance run --auto --detach` after fetch, commit and push, and that
  process can still be writing inside a clone after the server has exited. The tests now turn
  automatic maintenance off, through the environment for the server and through the bare
  repository's own config for the push side, which does not see that environment.

## 0.3.7

- Start without any credentials instead of exiting. With no token and no registered project,
  the server now lists its tools, and every call that needs Overleaf answers that
  `OVERLEAF_GIT_TOKEN` is not set, as does `list_projects`. Glama's sandbox starts a listed
  server with no credentials, and 0.3.6 exited there before answering `initialize`. A project
  registered without any token is still a startup error, since that configuration is half written.
- Wait for the package document `npm install` reads, not only the per-version one, before
  verifying a publication. For 0.3.6 the version document answered while the abbreviated
  packument the install fetches still lacked the version, so the install failed with ETARGET,
  and the GitHub release and the MCP registry listing were skipped until the job was rerun.

## 0.3.6

- Say in every tool description what the tool returns. Only `project_summary` declares an
  output schema, so for the other seventeen the description is the only place a client learns
  the reply's shape and its no-op cases: a missing snippet, a section title that matches
  nothing, a destination that already exists. The edit and file tools now also say that they
  pull from Overleaf first. `move_file` named `\\input` with two backslashes because the source
  escaped them twice; it now names `\input`, and the contract test rejects a doubled backslash
  in any description.

- Give npm up to ten minutes to serve a new version before the release workflow calls the
  publication missing. npm accepts a publish before its registry returns it, and 0.3.5 took
  about two minutes to appear; the check allowed one, so it failed a publish that had
  succeeded and skipped the GitHub release and the MCP registry listing until it was rerun.

## 0.3.5

- Stop the package check failing on upstream patch releases. It installs the packed archive
  the way a user does, which makes npm resolve this package's declared ranges against the
  registry instead of reading the archive's shrinkwrap, so that tree is always the newest one
  those ranges allow — then it required that tree to be version-identical to the lock. The two
  can only agree in the window between an upstream publish and the next `npm update`, so CI
  went red on branches that had not touched a dependency, with the same unrelated dependency
  bump as the fix each time. `hono` hit it most often, being an unpinned peer of the MCP SDK
  with a fast release cadence, but every runtime range was exposed the same way. The trees are
  now compared by shape: a package in one and not the other fails, and so does a major version
  apart (a minor, for a 0.x package), which is how an unpinned peer would slip an untested
  major into a user's tree. Every copy npm nests counts, so a second major nested beside the
  hoisted one fails too. A newer patch or minor is only printed, with `npm update` as the way
  to bring the lock level, since both trees are tested. Dependabot will not do it: its npm
  version updates only bump dependencies this package names, and `hono` is not one.

- Add executable specifications. `tests/features/publishingToOverleaf.feature` states in plain
  sentences what this server promises a co-author — an edit waits in the clone, a push that
  would overwrite their newer work is refused, a deletion stays local until it is pushed — and
  every sentence is bound to a real call against the server over stdio. The prose and the
  behaviour are checked against each other on every run: a sentence with no binding fails the
  suite, so the document cannot quietly stop being true. Run through Vitest with
  `@amiceli/vitest-cucumber`, a development dependency, so there is no second test command.

- Refresh the runtime dependencies to the newest versions the declared ranges allow:
  `@modelcontextprotocol/server` 2.3.1, `@modelcontextprotocol/node` 2.1.1 and `hono` 4.13.13.
  The MCP SDK packages are now licensed Apache-2.0, and `@modelcontextprotocol/node` depends
  on `hono` directly instead of as a peer.
- Let the repository audit accept a named advisory until a review date. `node-forge` has a
  high-severity advisory with no fixed release, reached only through `@anthropic-ai/mcpb`, a
  development dependency, in a signature check this repository never calls; npm cannot
  ignore one advisory, so it held every branch red. `npm run audit:dependencies` now fails on
  anything not listed in `scripts/audit/acceptedAdvisories.mjs`, and on a listed advisory once
  its review date passes. The audit of the installed runtime tree is unchanged and accepts
  nothing.

- Fix the category names `project_summary` promises. Its output schema named a category
  `bib`, which this project has never produced; the real names are `tex`, `bibliography`,
  `figure`, `class-or-style`, `build-artifact` and `other`, and two of them were missing
  from the list entirely. The schema now builds that list from `LATEX_FILE_CATEGORIES` in
  `latexProjectFiles.ts`, so prose can no longer drift from what the code emits.
- Cover the three places where a test could not have caught a defect it was meant to.
  `delete_file` and `move_file` remove and relocate files from a client-supplied path, but
  `symlinkEscape.test.ts` — the file that proves path containment for every other file
  operation — did not exercise them; it does now, for both ends of a move. `ranges` payload
  parsing had no unit test at all, although it is the one input on this server with no
  published contract and the fake remote only ever produces well-formed shapes. And the
  `project_summary` assertion parsed the text block, so it would have passed with no
  structured content on the wire at all; it now validates the wire value against the
  schema the tool advertises.

- Add `delete_file` and `move_file`, the two parts of the file surface `write_file` could not
  express: the server could create and overwrite a file but never remove or rename one, so
  cleaning up an obsolete draft or reorganising a paper's sections meant leaving Overleaf.
  Both go through the Git bridge like every other edit, so a removal is local until
  `push_changes` and `discard_local_changes` undoes it. `move_file` refuses rather than
  overwrite an existing destination, and says which LaTeX references it has not rewritten.
- Rewrite every tool description and every parameter description against what the code
  actually does. Three tools described their `project` parameter more narrowly than the
  server accepts, or did not describe it at all, so a model could not know an Overleaf
  address was a valid value. Descriptions now also state when to call a tool and when to
  prefer another, which side effects it has, and where its behaviour stops: `search_project`
  names the eight extensions it actually searches, `read_section` and `edit_section` name the
  trailing matter a section stops at, and `add_comment` says the thread it creates is empty.
- Declare `openWorldHint` on every tool. Every tool but `list_projects` contacts Overleaf,
  including the read tools, which pull before answering; none of them said so.
- Declare an `outputSchema` for `project_summary` and return its result as
  `structuredContent`, so a client gets a typed object with documented fields instead of a
  JSON string it has to parse out of a text block.

## 0.3.4

- Describe this server by what makes it different. Every storefront line, on npm, in the MCP
  registry, and in both plugin marketplaces, said "over the Overleaf Git bridge", which is the
  positioning of every competing Overleaf server and omits the one capability none of them
  has. The package description, the plugin and bundle copy, and the README's opening now name
  tracked changes.
- List `OVERLEAF_SESSION_COOKIE` in the registry record and in `--help`. Neither mentioned it,
  so nothing a user could read before installing said the tracked-changes tools existed.

## 0.3.3

- Add three optional tools that reach Overleaf's editor instead of its Git bridge, so an edit
  can arrive as a suggestion in the review panel rather than as finished text. `suggest_edit`
  sets the tracked-changes flag on an editor operation, which a Git push cannot express;
  `list_tracked_changes` reads the suggestions and comment-thread anchors on a document;
  `add_comment` anchors a thread to a passage. They need an Overleaf session cookie, which is
  a different and broader credential than the Git token, so they are registered only when one
  is configured and the other sixteen tools are unchanged without it. See
  [Tracked changes](docs/tracked-changes.md) for what they cannot do and why the protocol they
  use is less stable than the bridge.
- Implement Overleaf's Socket.IO 0.9 wire format directly rather than depending on the
  browser client it is forked from, and use the WebSocket built into Node, so the new tools
  add no runtime dependency. The codec is verified packet by packet against Overleaf's own
  parser.
- Open the README with what distinguishes this server, since the answer to "which Overleaf
  MCP server" was previously only reachable by reading a comparison document.
- Extend the related-projects comparison to the two servers that do not use the Git bridge,
  and record which of their capabilities this one now has.

## 0.3.2

- Accept a project's Overleaf address wherever a tool takes `project`, not just its raw
  24-character id. Someone reaching for a second paper has what the address bar holds, and
  the id-only form meant a client configured with one project could reach the rest of the
  account only through a string nobody has to hand. `setup` and `OVERLEAF_PROJECT_ID`
  already took an address; the tools now agree with them.
- Have `list_projects` say that any other project can be named by its address, so the
  configured list stops reading as the only choice. Its empty state no longer leads with
  `OVERLEAF_PROJECTS`, an environment variable a bundle or plugin user never sets.
- Correct what this project says about Overleaf plans. Overleaf documents Git integration
  as gated on the project owner's subscription rather than the caller's, and documents no
  plan restriction on generating a token. The README, the `setup` failure message, and the
  Claude Desktop install panel each claimed the user's own plan had to include Git.
- Ship this repository as a plugin marketplace for both Claude Code and Codex. Adding it
  with `claude plugin marketplace add yangzichao/mcp-server-overleaf` or the matching
  `codex` command, then installing `overleaf@mcp-server-overleaf`, replaces a hand-written
  client configuration entry. One `plugins/overleaf` directory serves both clients, so they
  cannot drift apart. The plugin declares no environment variables, so a public marketplace
  cannot carry a credential; the server reads the `projects.json` that `setup` writes.
  `npm run plugins:build` regenerates both manifests and both marketplaces from
  `package.json`, and the check suite fails if the committed files drift.
- Lead the README with a table of every client and the route that installs it, and fix a
  stale link from the ChatGPT tunnel guide into the README.
- Refresh the shrinkwrap for zod 4.6.2.

## 0.3.1

- List the server in the official MCP registry. The release workflow now authenticates with
  GitHub OIDC and publishes `server.json` under `io.github.yangzichao/mcp-server-overleaf`,
  describing both the npm package and the `.mcpb` bundle, with the bundle hash taken from the
  exact file the same job attached to the release.
- Add `mcpName` to `package.json`, which is how the registry proves npm package ownership.

## 0.3.0

- Package the server as a Claude Desktop bundle: `npm run mcpb:build` produces a `.mcpb`
  archive holding the published npm tarball, its runtime dependencies, a generated
  icon, and a manifest whose tool list is read back from the staged server over stdio. The
  release workflow attaches it to the GitHub release, so Claude Desktop users install by
  double-clicking one file.
- Accept an Overleaf project URL wherever `OVERLEAF_PROJECT_ID` is read, not only a bare
  24-character id. The desktop install panel can now ask for the address bar.
- Mark `replace_text` and `push_changes` with `destructiveHint: true`. Both change the user's
  paper, and the Connectors Directory requires the applicable hint on every tool.
- Add a privacy policy covering what the server stores, where it sends it, and what it never
  collects.

## 0.2.0

- Add `mcp-server-overleaf setup`. One command checks Node and git, takes the project
  address and a git token, proves the token reaches Overleaf, and registers the server with
  the clients installed on the computer: Claude Code, Codex, Claude Desktop and Cursor.
  Nothing is written until Overleaf accepts the token, so a failed run leaves nothing behind.
- Keep the Overleaf token in one file. Setup writes the per-user `projects.json` the server
  already discovers, at mode 600, so no client configuration holds the secret or a path to it.
- Register clients with absolute paths rather than `npx`. A desktop application starts with
  a much smaller PATH than a terminal and often cannot find `npx`; resolving a package on
  every launch also competes with the client's own startup timeout. Run from an npx cache,
  which npx may prune, setup installs a pinned copy under `~/.overleaf-mcp` first.

## 0.1.2

- Publish a runtime-only shrinkwrap. npm builds a dependency's tree from the lock inside the
  tarball, so the development entries in the shipped one made `npm install mcp-server-overleaf`
  fetch the compiler, the linter and the test runner as well: 208 packages and 1.4 GB where 7
  packages and 19 MB are needed. A first `npx` run took long enough to exceed an MCP client's
  startup timeout. The package check now fails if the shipped shrinkwrap still describes
  development dependencies.
- Move the locked `zod` to 4.6.1, within the declared range. The release check installs the
  newest resolution of the declared ranges, so the lock has to keep up with it.
- Stop inheriting the user's global Git settings that break a commit. A `commit.gpgsign`
  or `core.hooksPath` in `~/.gitconfig` made `push_changes` fail to sign or be refused by
  someone else's hook; `http.proxy` and `url.*.insteadOf` are still inherited on purpose.
- Match `search_project` regular expressions on a worker thread under a deadline. A
  pattern that backtracks exponentially, such as `(a+)+`, previously blocked the whole
  server while holding the project lock. Truncating the line never bounded this.
- Treat a blank `OVERLEAF_MCP_HTTP_HOST` or `--host` as unset. Node reads an empty host as
  every interface, so the loopback default could silently become network-reachable.
- Expand a text-only checkout only for a file Git is tracking. A mistyped path or a
  newly created file turned sparse checkout off permanently for the whole project.

## 0.1.1

- Fix the release publisher so npm receives the verified archive as an explicit local path.

## 0.1.0

Initial release candidate:

- Sixteen tools for reading, searching, editing, reviewing, synchronizing, compiling,
  and explicitly publishing Overleaf projects through the Git bridge.
- Collaborator conflict protection, path and symlink containment, secret redaction,
  inter-process locks, and recovery after rejected pushes and restarts.
- Project JSON configuration and independent token files, extension filtering, and a structured project summary.
- Explicit-baseline incremental reads, bounded snapshots, and optional revision checks on every edit.
- Opt-in text-only sparse checkout, with safe expansion for reads, edits and compilation.
- Local stdio and authenticated Streamable HTTP transports.
- Precompiled npm command, an external configuration file for npx, and version reporting.
- Locked dependencies, repeatable package builds, installed-package integration tests,
  and a GitHub Actions publication workflow with provenance and registry verification.

Supported release validation: macOS and Linux; Node 22.14+, including 24 and 26.
TeX is optional except for `compile_project`. Overleaf Git integration is required.
