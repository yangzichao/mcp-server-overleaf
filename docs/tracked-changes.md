# Tracked changes, review comments and Overleaf's web app

With a session cookie, this server also reaches Overleaf's editor and web application instead
of only its Git bridge. An edit can then arrive as a suggestion in the review panel rather than
as finished text, a comment thread can be read and answered, a project can be compiled on
Overleaf without a local TeX installation, and projects, folders and settings can be managed.
The cookie is optional and is a different kind of credential from the Git token. This page is
about that trade.

## Why the Git bridge cannot do this

A push through `git.overleaf.com` always lands as ordinary content. Track-changes mode does
not apply to it, because the tracked-changes flag does not exist at the Git layer at all.

In Overleaf's own source, an editor operation carries `meta.tc`, a random seed. The document
updater reads it in `services/document-updater/app/js/RangesManager.js`:

```js
const trackingChanges = Boolean(update.meta?.tc)
rangesTracker.track_changes = trackingChanges
if (update.meta?.tc) {
  rangesTracker.setIdSeed(update.meta.tc)
}
```

Nothing in a Git push can set that flag. So a second connection is needed, speaking the same
protocol the web editor speaks.

## What the second connection is

Overleaf's real-time service, on Socket.IO 0.9. `services/real-time/package.json` pins
`github:overleaf/socket.io#0.9.19-overleaf-12`, a fork of a protocol older than the `socket.io`
package now on npm and not wire-compatible with it. This server implements the 0.9 wire format
directly rather than depending on a browser client from a Git URL, and uses the WebSocket built
into Node, so the review tools add no runtime dependency.

## The credential, and why it is different

The Git bridge takes a scoped token. The real-time service takes a browser session, and there
is no token equivalent. `services/real-time/app/js/SessionSockets.js` authenticates a
connection by reading a signed session cookie out of the handshake and looking it up in the
session store, and that is the only path it has.

That means:

- **The cookie covers your whole Overleaf account**, not one project. A Git token is narrower.
- **It expires.** Signing out, changing your password, or simply time will invalidate it, and
  the tools will say so rather than failing obscurely.
- **It is a credential in your client's configuration.** Prefer `OVERLEAF_SESSION_COOKIE_FILE`,
  pointing at a file only you can read, over putting the value in a client's `env` block.

This is why the cookie is optional. With no cookie configured, the server does not offer
`read_review`, `manage_tracked_changes`, `manage_comments` or `manage_project`, nor the views
and actions of other tools that need the web application, and everything else works exactly
as before.

The cookie is sent only to the web host below. Compiled output is fetched from that host
too, with the compile group and server id the editor uses, and never from Overleaf's separate
PDF domain, so the cookie does not travel to a second host.

## Configure it

| Variable | Meaning |
| --- | --- |
| `OVERLEAF_SESSION_COOKIE` | The `overleaf_session2` cookie from a signed-in browser. Turns these tools on. |
| `OVERLEAF_SESSION_COOKIE_FILE` | Absolute path to a file holding the same value. Preferred. |
| `OVERLEAF_WEB_BASE_URL` | The Overleaf web address. Default `https://www.overleaf.com`. |

To find the cookie: open Overleaf in a browser where you are signed in, open the developer
tools, and copy the value of the `overleaf_session2` cookie for that site. A self-hosted
installation usually calls it `sharelatex.sid` instead; both names are accepted. You can paste
the whole cookie string, a single `name=value` pair, or the bare value.

```bash
OVERLEAF_SESSION_COOKIE=s%3A...
```

## Without Git integration

Overleaf's Git bridge is a paid feature; the editor is not. A server configured with only a
session cookie, and no `OVERLEAF_GIT_TOKEN`, offers 13 of the 15 tools. `read_history` and
`push_changes` are not offered, since both need the clone.

```bash
OVERLEAF_SESSION_COOKIE_FILE=/home/you/.overleaf-mcp/session-cookie
OVERLEAF_PROJECTS=paper=64a1b2c3d4e5f6a7b8c9d0e1   # optional: a name and a default
```

Name a project by its Overleaf address, its id, or a name registered as above, or call
`list_projects` to find it. A project in `OVERLEAF_PROJECTS_CONFIG` may leave out `gitToken`
when a cookie is configured; the Git-bridge tools then refuse that one project and say why,
while projects with a token keep working through Git.

On such a server the reading and editing tools work on the live editor instead of a clone:

- `read_project` gives the overview, the file tree, the outline across included files, the
  members and Overleaf's word count. `read_file` reads a document whole, as a line range, as one
  section, or with its included files inlined, with pending suggestions read as if accepted,
  and shows a figure as an image.
- `search_project`, `check_references` and `look_up_citations` read the documents through the
  editor connection, one join per document per call.
- `edit_file` and `manage_files` take effect in Overleaf at once, with no `push_changes` step
  and no undo here, and arrive as ordinary text even when the project has track changes on, as
  a Git push does. They need edit access; a reviewer is pointed at `manage_tracked_changes`.
  An edit is sent against the document version it was computed from, so Overleaf transforms it
  against a co-author's concurrent typing as it does between two open editors.
- `compile_project` compiles on Overleaf.

What stays with the clone: `mode`, `revision` and `expectedRevision` on reads and edits,
restoring a file from an earlier revision, discarding local changes, history, the unpushed
diff, and compiling locally.

## The tools

Over the real-time editor connection and the web application:

| Tool | What it does with a cookie |
| --- | --- |
| `read_review` | `tracked_changes`: the suggestions and comment anchors on one document, with line numbers. `comments`: every thread with its messages, anchors and state. |
| `manage_tracked_changes` | `suggest` an edit as a tracked change: an exact snippet, a whole section or a whole file. `accept` or `reject` suggestions by id or all at once in a document. |
| `manage_comments` | `add` a thread on an exact passage with its first message, `reply`, `resolve`, `reopen`, `delete` a thread, and `edit_message` or `delete_message` inside one. |
| `manage_project` | `create` a blank or example project, `create_from_zip`, `copy`, `rename`, `archive`/`unarchive`, `trash`/`untrash`, `update_settings` (compiler, main document, TeX Live image, spell-check language, track changes for everyone), `tag`/`untag`, and `download_zip`. |
| `list_projects` | Every project the account can open, with access level, tags and address, filtered by owned, shared, archived, trashed or tag. |
| `read_project` | `members`: collaborators and their access, and pending invitations for the owner. `word_count`: Overleaf's own count. |
| `compile_project` | `where: "overleaf"` compiles on Overleaf's servers, reports errors and warnings, and saves the PDF, log, `.bbl`, `.blg` and SyncTeX file. |
| `manage_files` | `create_folder`, which a Git push cannot do, since Git does not keep empty folders. |

Every write here takes effect in Overleaf immediately. There is no separate `push_changes`
step, because nothing went through a clone. That is the opposite of every Git-bridge editing
tool, and deliberate for suggestions: a suggestion is already reversible by the person
reviewing it. Accepting, rejecting, resolving, deleting, archiving, trashing and changing
settings are not reversible from here, so a client should confirm them with the user first.
Permanent project deletion and sharing changes (inviting, removing or transferring) are not
offered at all: a prompt injected into a paper must not be able to give someone else access.

Overleaf requires review permission for a tracked change, so read-only access is refused before
anything is sent. A reviewer who may not write plain text can still suggest. Accepting and
rejecting need edit permission and are refused up front for review-only and read-only access.
Both re-read the document afterwards and report a suggestion that is still there.

Rejecting has no route of its own in Overleaf. The editor undoes each suggestion with an
ordinary edit flagged as an undo, working from the end of the document backwards so earlier
positions stay valid, and this server does the same.

## What it cannot do

- **A verified contract for comments and the track-changes switch.** The routes behind
  `read_review` (view `comments`), `manage_comments` and `manage_project`'s track-changes
  setting are the ones the open-source editor calls in
  `services/web/frontend/js/features/review-panel/`, but their server side lives in a module
  outside Overleaf's open-source tree. They follow what the editor sends, not a published
  interface, which is why the tools read the state back after changing it.
- **History-OT documents.** A document Overleaf has moved to its newer history-OT format
  refuses the real-time protocol this server speaks, so the review tools explain that and stop.
  The Git-bridge tools still work on it.
- **Emoji and other characters outside the Basic Multilingual Plane.** Overleaf's editor
  replaces them with U+FFFD as they are typed (`filter-characters.ts`), and document-updater
  does the same to every insertion it receives (`UpdateManager._sanitizeUpdate`), so
  editor edits and suggestions refuse them rather than store "��". Write the LaTeX command
  instead.
- **Project history after a quick review sequence.** On 2026-11-20, rejecting a suggestion,
  suggesting again on the same words, accepting that and then editing it directly, all within a
  few seconds, left the live document correct but Overleaf's project history with text missing
  from that line. On this account the ZIP download is built from that history (the
  `zip-from-history` split test in `ProjectDownloadsController`), so it had the wrong line too.
  The same steps with the history flushed between them, by downloading the ZIP after each,
  did not reproduce it, and one damaged document recovered after a later edit while another did
  not. Whether Overleaf's own editor does the same when a person works that fast has not been
  checked.
- **A guarantee of stability.** The Git bridge is a documented, supported interface. The
  real-time protocol and the web routes are internal to Overleaf and can change without
  notice. If they do, what the cookie adds breaks and what the Git bridge does keeps working.

## Verification

`tests/integration/trackedChanges.test.ts` and the suites in `tests/integration/review/` run
against `tests/integration/fakeOverleafRealtime.ts`, a real HTTP and WebSocket server speaking
the real 0.9 protocol and reproducing the behaviour read out of `overleaf/overleaf`: the
handshake, the permission check in `WebsocketController._assertClientCanApplyUpdate`, the
line escaping in `WebsocketController`, and the `meta.tc` branch in `RangesManager`.

The wire codec is checked against Overleaf's own parser rather than only against itself:
every packet this server encodes was compared byte for byte with the output of
`overleaf/socket.io-client` at `0.9.17-overleaf-5`, and every packet shape it decodes was
compared with that parser's reading of the same frame.

The web tools in `tests/integration/web/` run against `tests/integration/fakeOverleafWeb.ts`
and `fakeOverleafAccount.ts`, which serve the routes, CSRF meta tag and login redirect the
open-source web application has.

On 2026-11-20 the 0.4.1 cookie tools were run against overleaf.com with only a session cookie
configured, on a test project: listing, reading (compared byte for byte with the ZIP),
compiling with the PDF saved, the ZIP, direct edits with Chinese, accents and `$$`,
`replaceAll`, suggestions rejected by id and accepted all at once, and a comment thread added,
replied to, resolved, reopened and deleted. That run found the emoji limit, the `readWrite`
access name and the history problem above. It is not part of the automated suites, and
self-hosted instances have not been tried.

What 0.5.0 added on top is tested against the fakes in `tests/integration/fakeWebRoutes/`
and `fakeOverleafRealtime.ts`, built from the open-source routes. On 2026-11-23 its reads were
run against overleaf.com on the same test project: `list_projects` with the owned, archived
and trashed filters, `read_project` views `members` and `word_count`, the cookie-only overview
with its compiler, TeX Live image, spell check and track-changes lines, the cookie-only
outline, `search_project` and `check_references` over the editor, `read_history` view
`blame`, `look_up_citations` on a document whose entries are written with `\bibitem`, its
`find` action by DOI and by title words, and `compile_project` on Overleaf saving the SyncTeX
map. texcount in the clone gave the same seven numbers as Overleaf's word count. Three reads
were only partly tried: arXiv answered 429 to every request from the test machine that day,
a lone `curl` included, so no arXiv lookup ran; the test project includes no other file, so
`read_file` with `followIncludes` returned one file as it is; and it holds no image for
`read_file` to return. Its writes have not been run against overleaf.com: project lifecycle,
tags, settings and the track-changes switch, the file tree and uploads without Git, editing
and deleting a single comment message, and editing through the editor.
