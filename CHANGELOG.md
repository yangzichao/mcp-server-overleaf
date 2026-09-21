# Changelog

## Unreleased

- Stop the package check failing on upstream patch releases. It installs the packed archive
  the way a user does, which makes npm resolve this package's declared ranges against the
  registry instead of reading the archive's shrinkwrap, so that tree is always the newest one
  those ranges allow — then it required that tree to be version-identical to the lock. The two
  can only agree in the window between an upstream publish and the next `npm update`, so CI
  went red on branches that had not touched a dependency, with the same unrelated dependency
  bump as the fix each time. `hono` hit it most often, being an unpinned peer of the MCP SDK
  with a fast release cadence, but every runtime range was exposed the same way. The trees are
  now compared by shape: a package in one and not the other fails, and so does a major version
  apart, which is how an unpinned peer would slip an untested major into a user's tree. A
  newer patch or minor is printed and left to Dependabot, since both trees are tested.

- Add executable specifications. `tests/features/publishingToOverleaf.feature` states in plain
  sentences what this server promises a co-author — an edit waits in the clone, a push that
  would overwrite their newer work is refused, a deletion stays local until it is pushed — and
  every sentence is bound to a real call against the server over stdio. The prose and the
  behaviour are checked against each other on every run: a sentence with no binding fails the
  suite, so the document cannot quietly stop being true. Run through Vitest with
  `@amiceli/vitest-cucumber`, a development dependency, so there is no second test command.

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
