# Tracked changes and review comments

Three tools reach Overleaf's editor instead of its Git bridge, so an edit can arrive as a
suggestion in the review panel rather than as finished text. They are off by default, need a
credential the other sixteen tools do not use, and this page is about that trade.

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

## Configure it

| Variable | Meaning |
| --- | --- |
| `OVERLEAF_SESSION_COOKIE` | The `overleaf_session2` cookie from a signed-in browser. Turns the review tools on. |
| `OVERLEAF_SESSION_COOKIE_FILE` | Absolute path to a file holding the same value. Preferred. |
| `OVERLEAF_WEB_BASE_URL` | The Overleaf web address. Default `https://www.overleaf.com`. |

To find the cookie: open Overleaf in a browser where you are signed in, open the developer
tools, and copy the value of the `overleaf_session2` cookie for that site. A self-hosted
installation usually calls it `sharelatex.sid` instead; both names are accepted. You can paste
the whole cookie string, a single `name=value` pair, or the bare value.

```bash
OVERLEAF_SESSION_COOKIE=s%3A...
```

## The tools

| Tool | What it does |
| --- | --- |
| `list_tracked_changes` | Reads the suggestions and comment-thread anchors on one document, with line numbers. |
| `suggest_edit` | Replaces an exact snippet so it arrives as a tracked change, waiting to be accepted or rejected. |
| `add_comment` | Anchors a review-panel comment thread to an exact passage. |

`suggest_edit` takes effect in Overleaf immediately. There is no separate `push_changes` step,
because nothing went through a clone. That is the opposite of every other editing tool here,
and deliberate: a suggestion is already reversible by the person reviewing it.

Overleaf requires review permission for a tracked change, so read-only access is refused before
anything is sent. A reviewer who may not write plain text can still suggest.

## What it cannot do

- **Comment text.** `add_comment` anchors the thread; the first message has to be written in
  Overleaf. `list_tracked_changes` reads which passage each thread hangs on, not what anyone
  said in it. The thread messages come from an HTTP route that is not in Overleaf's open-source
  tree, so nothing here is written against a verified contract for it.
- **Accept or reject.** Neither is implemented yet.
- **A guarantee of stability.** The Git bridge is a documented, supported interface. The
  real-time protocol is internal to Overleaf and can change without notice. If it does, the
  review tools break and the other sixteen do not.

## Verification

`tests/integration/trackedChanges.test.ts` and `tests/integration/reviewTools.test.ts` run
against `tests/integration/fakeOverleafRealtime.ts`, a real HTTP and WebSocket server speaking
the real 0.9 protocol and reproducing the behaviour read out of `overleaf/overleaf`: the
handshake, the permission check in `WebsocketController._assertClientCanApplyUpdate`, the
line escaping in `WebsocketController`, and the `meta.tc` branch in `RangesManager`.

The wire codec is checked against Overleaf's own parser rather than only against itself:
every packet this server encodes was compared byte for byte with the output of
`overleaf/socket.io-client` at `0.9.17-overleaf-5`, and every packet shape it decodes was
compared with that parser's reading of the same frame.

Neither test suite has been run against a live Overleaf account, and this feature has not been
exercised end to end against overleaf.com or a self-hosted instance.
