# Testing

`npm run check` runs everything that needs no Overleaf account. Three layers sit on top of
the unit tests, each in its own folder:

| Command | Folder | What it proves |
| --- | --- | --- |
| `npm run test:features` | `tests/features/` | Gherkin feature files state what each tool promises; every sentence is bound to a call against the compiled server over stdio, with fake Overleaf Git, editor and web services. |
| `npm run test:properties` | `tests/properties/` | fast-check properties for the pure parts: text replacement, LaTeX parsing, Socket.IO framing, path safety, redaction and others. `tests/properties/protocol/` also calls every tool of the compiled server with arguments drawn from its own input schema. |
| `npm run test:e2e` | `tests/endToEnd/` | The same server against a real Overleaf project. Not part of `npm run check`. |

The first two also run inside `npm test`.

## Calling every tool with generated arguments

`tests/properties/protocol/` starts the compiled server twice, once with a Git token and a
session cookie and once with the cookie alone, against fakes for the Git remote, the editor,
the web application, doi.org, Crossref, arXiv, latexmk and texcount. It reads each tool's
input schema from `tools/list` and calls the tool with values drawn from it: a random subset
of the arguments, or the set one action takes. A refusal that names an argument as not
applying, or as missing, is retried without it, or with it.

Every reply has to be a result or a plain refusal. A JavaScript error name, a Node error code
such as `ENOENT:`, a stack frame, an empty reply, a JSON-RPC error other than invalid params,
or a dead server fails the test. A tool marked read-only must leave the clone, the remote and
the fakes as they were, and so must a write that answers with an error.

Each tool gets a fifth of `FAST_CHECK_RUNS`, at most 50: 20 in `npm run check`, which takes
about 90 seconds, and 50 when exploring, about 4 minutes. The server reads an empty settings
file, so no `.env` in the checkout can add a real credential, and local paths stay inside a
temporary folder. A failure prints the tool, the arguments, what was wrong and the reply;
rerun it with the `FAST_CHECK_SEED` that fast-check prints.

## Static checks

These read the code without running it, so they give the same answer on every machine.

| Command | What it catches |
| --- | --- |
| `npm run typecheck` | Type errors, plus unused locals and parameters, unreachable code, missing returns, switch fallthrough and side-effect imports whose path does not resolve. |
| `npm run lint` | Biome, including its type-aware rules for a promise that is never awaited or is used as a condition or as a callback that should return nothing, a switch that misses a case, and import cycles. |
| `npm run check:unused` | knip: files nothing imports, exports nothing uses and dependencies nothing loads. Part of `npm run check`. |
| `npm run check:regex` | recheck: a regular expression in `src` that backtracks super-linearly, so crafted LaTeX, BibTeX or an API answer could stall a tool. Takes about 20 seconds, so it runs in CI and `npm run check:release`, not in `npm run check`. |
| `actionlint` | The workflows in `.github/workflows`, and the shell in their `run` steps through shellcheck. CI downloads a pinned release and checks its SHA-256; locally, `brew install actionlint shellcheck` and run `actionlint`. |

A pattern that must stay super-linear goes in
`scripts/checks/regexBacktracking/reviewedRegularExpressions.json` with the reason its input
cannot grow large. The check fails on a review that no longer matches a slow pattern.

## Live end-to-end run

Use a throwaway project you own, never a co-author's paper. The run writes a scratch folder
`mcp-e2e/<run id>/` through the Git bridge and pushes it, then deletes it and pushes again.
Through the editor it appends one LaTeX comment line to a document, suggests, accepts and
rejects edits and runs a comment thread inside that line, then removes it. It also compiles
on Overleaf and downloads the ZIP. It never creates projects, because no tool can delete one
for good.

The suite reads its own variable names, so a normal `.env` cannot aim it at a real paper:

| Variable | Needed for |
| --- | --- |
| `OVERLEAF_E2E_PROJECT_ID` | Everything. Without it every file is skipped. |
| `OVERLEAF_E2E_GIT_TOKEN` | `tests/endToEnd/gitBridge/`. Needs a plan with Git integration. |
| `OVERLEAF_E2E_SESSION_COOKIE` | `tests/endToEnd/editor/` and `tests/endToEnd/account/`. The `overleaf_session2=…` cookie. |
| `OVERLEAF_E2E_WEB_BASE_URL` | Optional, defaults to `https://www.overleaf.com`. |
| `OVERLEAF_E2E_EDITOR_DOCUMENT` | Optional, defaults to `main.tex`. Needs one line of 8+ characters that occurs once. |
| `OVERLEAF_E2E_ENV_FILE` | Optional absolute path to a file holding the variables above. |

```sh
OVERLEAF_E2E_ENV_FILE=$HOME/.config/overleaf-e2e.env npm run test:e2e
```

`look_up_citations` (action `verify`) in the Git bridge run sends one DOI to doi.org and
Crossref.
