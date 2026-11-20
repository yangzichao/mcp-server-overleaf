# Tracked changes, review comments and Overleaf's web app

Thirteen tools reach Overleaf's editor and web application instead of its Git bridge. With
them an edit can arrive as a suggestion in the review panel rather than as finished text, a
comment thread can be read and answered, and a project can be compiled on Overleaf without a
local TeX installation. They are off by default and need a credential the other twenty-three
tools do not use. This page is about that trade.

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

This is why the tools are optional. With no cookie configured, the server does not register
them at all, and everything else works exactly as before.

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
session cookie, and no `OVERLEAF_GIT_TOKEN`, still offers every tool below, plus
`list_projects`. The Git-bridge tools are not offered at all, since each of them would only
answer with a setup note.

```bash
OVERLEAF_SESSION_COOKIE_FILE=/home/you/.overleaf-mcp/session-cookie
OVERLEAF_PROJECTS=paper=64a1b2c3d4e5f6a7b8c9d0e1   # optional: a name and a default
```

Name a project by its Overleaf address, its id, or a name registered as above, or call
`list_account_projects` to find it. A project in `OVERLEAF_PROJECTS_CONFIG` may leave out
`gitToken` when a cookie is configured; the Git-bridge tools then refuse that one project and
say why, while projects with a token keep working through Git.

Reading and editing whole files without Git is not here yet: on this setup, `download_project_zip`
is the way to get the source.

## The tools

Review, over the real-time editor connection and the web application:

| Tool | What it does |
| --- | --- |
| `list_tracked_changes` | Reads the suggestions and comment-thread anchors on one document, with line numbers. |
| `suggest_edit` | Replaces an exact snippet so it arrives as a tracked change, waiting to be accepted or rejected. |
| `accept_tracked_changes` | Accepts suggestions by id, or all of them in a document. |
| `reject_tracked_changes` | Rejects them: a suggested insertion goes, a suggested deletion comes back. |
| `list_comments` | Reads comment threads with every message, their anchors, and whether they are resolved. |
| `add_comment` | Starts a thread on an exact passage, with its first message. |
| `reply_to_comment` | Adds a message to a thread. |
| `resolve_comment` | Resolves a thread, or reopens a resolved one. |
| `delete_comment` | Deletes a thread and every message in it. |

The account and its projects, over the web application:

| Tool | What it does |
| --- | --- |
| `list_account_projects` | Every project the account can open, with its access level and address. |
| `create_project` | A new blank project, or one from Overleaf's example paper. |
| `compile_on_overleaf` | Compiles on Overleaf's servers and reports errors and warnings; can save the PDF. |
| `download_project_zip` | Saves the whole project, binary files included, as a ZIP. |

Every one of these takes effect in Overleaf immediately. There is no separate `push_changes`
step, because nothing went through a clone. That is the opposite of every Git-bridge editing
tool, and deliberate for suggestions: a suggestion is already reversible by the person
reviewing it. Accepting, rejecting, resolving and deleting are not reversible from here, so
a client should confirm them with the user first.

Overleaf requires review permission for a tracked change, so read-only access is refused before
anything is sent. A reviewer who may not write plain text can still suggest. Accepting and
rejecting need edit permission and are refused up front for review-only and read-only access.
Both re-read the document afterwards and report a suggestion that is still there.

Rejecting has no route of its own in Overleaf. The editor undoes each suggestion with an
ordinary edit flagged as an undo, working from the end of the document backwards so earlier
positions stay valid, and this server does the same.

## What it cannot do

- **A verified contract for comment messages.** The routes `list_comments`, `add_comment`,
  `reply_to_comment`, `resolve_comment` and `delete_comment` use are the ones the open-source
  editor calls in `services/web/frontend/js/features/review-panel/`, but the server side of
  them lives in a module outside Overleaf's open-source tree. They follow what the editor
  sends, not a published interface.
- **History-OT documents.** A document Overleaf has moved to its newer history-OT format
  refuses the real-time protocol this server speaks, so the review tools explain that and stop.
  The Git-bridge tools still work on it.
- **A guarantee of stability.** The Git bridge is a documented, supported interface. The
  real-time protocol and the web routes are internal to Overleaf and can change without
  notice. If they do, these thirteen tools break and the other twenty-three do not.

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

None of these suites has been run against a live Overleaf account, and these features have not
been exercised end to end against overleaf.com or a self-hosted instance.
