# mcp-server-overleaf

Your papers live on Overleaf, and the model you want to write with cannot reach them.
Copy-pasting sections into a chat window works until you paste something back and quietly
flatten a change your co-author made ten minutes ago. This is an MCP server that gives an
AI client real access to your Overleaf projects over the official git bridge: it reads the
actual files, edits them in a local clone, and publishes only when you say so. Before every
read and before every push it checks what your collaborators have done, and if your edit
and theirs touch the same lines it refuses to push and shows you both versions rather than
picking a winner. Losing someone else's work is the one outcome it is built to prevent.

---

The rest of this file is written for an AI agent installing the server. It is meant to be
read top to bottom and followed literally.

## What you are installing

An MCP server exposing 15 tools over stdio or Streamable HTTP. One core, two transports;
the tool implementations are identical and only the framing differs.

Requires Node 20+ and git on PATH. `compile_project` additionally needs `latexmk` and a TeX
distribution; every other tool works without them.

The user needs an Overleaf account whose plan includes Git integration. Do not assert
whether their specific plan qualifies. Verify it directly in step 3 instead.

## Step 1: build

```bash
npm install && npm run build
```

Confirm `dist/index.js` exists before continuing. Record the absolute path of the
repository root; every client configuration below needs it, and relative paths will not
work because clients spawn the server from an arbitrary working directory.

## Step 2: collect two values from the user

**The git authentication token.** Generated at <https://www.overleaf.com/user/settings>,
under Git integration. One token covers all their projects and expires after a year. It
starts with `olp_`.

Ask the user to paste it into `.env` themselves rather than into the chat, using the
command in step 3. A token pasted into a conversation is in the transcript permanently and
has to be rotated. If they paste it anyway, tell them plainly to rotate it, and continue.

**One or more project ids.** The last path segment of a project URL:
`https://www.overleaf.com/project/<projectId>`. A project id is exactly 24 hexadecimal
characters. Anything else is not a project id, and you should ask again rather than guess.

## Step 3: write .env and verify the token works

```bash
cp .env.example .env && chmod 600 .env
```

Then have the user fill in:

```
OVERLEAF_GIT_TOKEN=olp_...
OVERLEAF_PROJECTS=paper=64a1b2c3d4e5f6a7b8c9d0e1
```

`OVERLEAF_PROJECTS` is a comma-separated list of `name=projectId` pairs. The names are
arbitrary labels the user picks. A bare project id with no name is also accepted and
registers under its own id. With exactly one project registered it becomes the default; with
several, set `OVERLEAF_DEFAULT_PROJECT` or every tool call must name a project.

Verify the credentials reach Overleaf before configuring any client:

```bash
git ls-remote https://git@git.overleaf.com/<projectId>
```

Git will prompt for a password. That is the token. Refs printed means it works. `403` or
`Repository not found` means either the token is wrong or that account's plan does not
include Git integration; resolve this before continuing, because every tool depends on it.

The server reads `.env` itself, because MCP clients spawn it without a shell. This keeps the
token in one file whose permissions the user controls, instead of copied into every client's
config. Anything the client sets in the environment explicitly still wins.

## Step 4: register with the client

Use the absolute path from step 1. Configure only the client the user actually asked for.

**Claude Code**

```bash
claude mcp add overleaf -s user -- node /absolute/path/to/mcp-server-overleaf/dist/index.js --stdio
```

Then run `claude mcp list` and confirm it reports `✔ Connected`. Do not report success
until you have seen that.

**Claude Desktop or Cursor** — add to the client's MCP config file:

```json
{
  "mcpServers": {
    "mcp-server-overleaf": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server-overleaf/dist/index.js", "--stdio"]
    }
  }
}
```

**Codex CLI** — add to `~/.codex/config.toml`:

```toml
[mcp_servers.mcp-server-overleaf]
command = "node"
args = ["/absolute/path/to/mcp-server-overleaf/dist/index.js", "--stdio"]
```

Set `default_tools_approval_mode = "writes"` if the user wants reads to run freely while
every write asks first.

**ChatGPT desktop** — Settings, then MCP servers, then Add server, with the same command and
arguments. Restart the app and type `/mcp` in the composer to confirm.

ChatGPT on the web cannot use any of the above. It requires the HTTP transport on a public
HTTPS endpoint with OAuth or no auth, because it does not send static bearer tokens. Say
this plainly rather than attempting a stdio setup that cannot work.

**Remote clients over HTTP**

```bash
node dist/index.js --http --port 3017
```

`--http` refuses to start without `OVERLEAF_MCP_HTTP_AUTH_TOKEN`, since anyone who reaches
the port could otherwise read and rewrite the user's papers. `--allow-anonymous` overrides
this and should only be used when the port is genuinely unreachable from outside the
machine. Do not pass it to work around a missing token.

## Step 5: verify end to end

Call `list_files`. A file listing means the whole path works: configuration, token, clone,
and the client connection. If it fails, the error text says which.

## The tools

Every tool takes an optional `project`, either a name from `OVERLEAF_PROJECTS` or a raw
24-character project id. Omit it to use the default.

| Tool | What it does |
| --- | --- |
| `list_projects` | The projects this server can reach |
| `list_files` | Tracked files, grouped by kind |
| `read_file` | Read a text file, optionally a line range |
| `list_sections` | Sectioning commands in a `.tex` file, with line ranges |
| `read_section` | The body of one section, found by title |
| `search_project` | Search tracked text files |
| `replace_text` | Replace an exact snippet, refusing ambiguous matches |
| `edit_section` | Replace one section wholesale |
| `write_file` | Overwrite or create a file |
| `show_diff` | The diff of everything not yet pushed |
| `discard_local_changes` | Throw away unpushed edits and commits, back to Overleaf's version |
| `project_status` | Sync state, pending edits, recent history |
| `sync_project` | Pull from Overleaf |
| `compile_project` | Compile with latexmk and report errors |
| `push_changes` | Commit and publish, with the collaborator check |

## How to use the tools safely

Edits are local until `push_changes`. This is the whole design, not an implementation
detail, and it is what lets a bad edit be thrown away instead of published.

Read `show_diff` before calling `push_changes`. Push once, with a real commit message; the
user sees it in Overleaf's history next to their co-authors' entries.

`push_changes` can return `conflict-with-collaborator`. This means someone edited the same
lines while you were working. Nothing was published and both versions are intact. Do not
retry, do not force, and do not attempt to merge the two yourself. Report the conflict and
let the user decide.

A refused push leaves its commit in the clone, so the clone is then both ahead of and
behind Overleaf and every later sync conflicts on the same lines. `discard_local_changes`
is the way out: it drops unpushed commits as well as uncommitted edits and returns the
clone to what Overleaf holds. Tell the user what is being thrown away before calling it,
because their edit is what goes.

`replace_text` refuses a snippet that appears more than once rather than silently changing
the first. Add surrounding context to make it unique, or pass `replaceAll` deliberately.

Prefer `replace_text` and `edit_section` over `write_file`. `write_file` replaces an entire
file, so a partial reconstruction of a document silently deletes the rest of it.

Compilation is optional and is not a gate. `push_changes` never checks that the document
builds, so a broken document can be published if you do not check first.

## Configuration reference

| Variable | Meaning |
| --- | --- |
| `OVERLEAF_GIT_TOKEN` | Required. From Overleaf account settings. |
| `OVERLEAF_PROJECTS` | Required. `name=projectId` pairs, comma separated. |
| `OVERLEAF_DEFAULT_PROJECT` | Which registered name to use when a call omits `project`. |
| `OVERLEAF_MCP_WORKSPACE_DIR` | Where clones live. Default `~/.overleaf-mcp/projects`. |
| `OVERLEAF_GIT_BASE_URL` | Default `https://git.overleaf.com`. |
| `OVERLEAF_MCP_COMPILE_TIMEOUT_MS` | Compile timeout. Must be a positive integer. |
| `OVERLEAF_MCP_HTTP_AUTH_TOKEN` | Bearer token required by `--http`. |
| `OVERLEAF_MCP_HTTP_PORT` | Port for `--http`. `--port` overrides it. |

## Why it behaves the way it does

Overleaf's git bridge is not a general git remote. Each project has exactly one branch with
one linear history, force pushes are refused, and there are no tags, submodules or LFS.
Everything here stays inside that envelope.

The real risk is not a failed push, it is silently overwriting a co-author, so writing and
publishing are separate:

1. Every read and every edit synchronizes with Overleaf first. If local work prevents
   synchronization, the call fails and preserves that work. Review it with `show_diff`,
   then publish it or explicitly discard it before continuing; stale reads and edits
   are refused.
2. Edits land in the local clone only. Nothing reaches Overleaf until `push_changes`.
3. `push_changes` re-checks Overleaf immediately before pushing and rebases onto anything
   that landed in the meantime. If that cannot be applied cleanly the push is refused and
   the conflict reported, rather than resolved by guessing.

The token is handed to git through a credential helper, so it never appears in argv, never
lands in `.git/config`, and never enters the model's context. It is stripped from every
string leaving the process, including from error messages.

Compilation writes outside the clone, so `.aux`, `.log` and `.pdf` files are never staged
and pushed back. Clones also carry a local exclude list, so a `.DS_Store` never reaches a
co-author's project.

Tool calls are serialized per project, first by an in-process queue and then by a lock
directory under the workspace, so a second server process, such as the same server
registered in two clients, waits instead of racing.

Client-supplied paths are checked twice: once as a path, and once against the filesystem
after symbolic links are resolved, so a link inside a clone cannot reach outside it or into
`.git`.

## Layout

```
src/
  config/      environment parsing, secret redaction
  overleaf/    git command runner, repository operations, project registry, path safety
  latex/       section parsing, file categorization
  workflow/    sync-before-edit, publish-with-conflict-check, compile
  tools/       MCP tool definitions
  transport/   stdio and Streamable HTTP
  server/      server factory shared by both transports
tests/
  config/ latex/ overleaf/  unit tests, run in-process
  integration/              spawn the built server and speak MCP to it over stdio or HTTP
```

## Development

```bash
npm run check
```

Runs the type checker, Biome, the build, and the tests in one pass.
The type checker includes test code. Every Vitest invocation builds the server first,
including focused runs and coverage, so the subprocess tests cannot use an old `dist`.

| Command | What it does |
| --- | --- |
| `npm run typecheck` | Type-check source, tests and Vitest configuration |
| `npm run lint` | Biome lint and format check |
| `npm run format` | Biome, applying fixes |
| `npm test` | Build, then Vitest, whole suite |
| `npm run test:coverage` | Build, then Vitest with v8 coverage |

The suites cover the same tool contract over stdio and HTTP, including schemas, error
flags, reading, editing, reviewing and publishing. Recovery tests exercise dirty-tree
sync, conflict recovery, remote rejection and reconnection, process restarts, a killed
lock holder, and simultaneous clients. New files and unpushed commits must remain
visible in `show_diff`. Deterministic subprocess fixtures test Git and compiler timeouts
without needing a network connection or TeX installation.

TeX-dependent tests share one availability check. Set `OVERLEAF_TEST_TEX=skip` to run
without TeX, or `OVERLEAF_TEST_TEX=required` to fail if `latexmk` or `pdflatex` is missing.
The default, `auto`, runs those tests when both executables are available. GitHub Actions
runs core checks on Linux and macOS with Node 20 and 24, plus a Linux job that installs
TeX and requires the compilation tests to run.

Tests never touch the real Overleaf. `tests/integration/fakeOverleafRemote.ts` stands up a
bare git repository plus a second clone acting as a co-author, which reproduces everything
the safety contract depends on: fetch, rebase, and a rejected push.

Coverage under-reports. The integration tests spawn `node dist/index.js` as a separate
process, and v8 cannot instrument a child, so `src/tools/` and `src/server/` report 0% while
being driven end to end over the real MCP wire protocol.

## License

MIT
