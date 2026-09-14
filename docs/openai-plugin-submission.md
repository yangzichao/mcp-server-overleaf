# OpenAI Plugin Directory Submission

This is the public, non-secret submission packet for proposing **Overleaf** to the universal
OpenAI plugin directory used by ChatGPT and Codex.

## Submission path

The released server is a local MCP server. It deliberately keeps each user's Overleaf Git
token and working clone on that user's computer; the project operator has no hosted service
and receives no user data.

OpenAI's self-serve public plugin submission currently accepts skills-only plugins and MCP
plugins backed by a stable public HTTPS endpoint. An MCP server that exposes private project
data and write actions is also expected to authenticate users through MCP-compatible OAuth
2.1. The local server therefore must not be submitted as if it were a public remote MCP
endpoint. The correct first request is for OpenAI to confirm a supported local-MCP review
path or approve an equivalent architecture before the privacy model is changed.

Official references:

- [Submit plugins](https://developers.openai.com/plugins/deploy/submission)
- [Remote MCP server review requirements](https://developers.openai.com/plugins/deploy/app-review)
- [Authentication](https://developers.openai.com/plugins/build/auth)
- [Submit a Claude Code plugin to OpenAI](https://developers.openai.com/plugins/guides/submit-claude-plugin)

## Public listing details

| Field | Proposed value |
| --- | --- |
| Name | Overleaf |
| Short description | Read and edit Overleaf papers, with tracked changes. |
| Category | Productivity |
| Developer | Zichao Yang |
| Website | https://github.com/yangzichao/mcp-server-overleaf |
| Documentation | https://github.com/yangzichao/mcp-server-overleaf#readme |
| Support | https://github.com/yangzichao/mcp-server-overleaf/issues |
| Privacy policy | https://github.com/yangzichao/mcp-server-overleaf/blob/main/docs/privacy-policy.md |
| Terms of use | https://github.com/yangzichao/mcp-server-overleaf/blob/main/docs/terms-of-use.md |

### Long description

Read, search, edit, and compile Overleaf papers from ChatGPT or Codex while keeping the
working clone and Overleaf Git token on your own computer. Edits remain local until you
explicitly approve `push_changes`, and `show_diff` lets you inspect them first. Before every
read and push, the server checks for collaborator changes. If both sides changed the same
lines, it stops and shows the conflict instead of choosing a winner.

With an optional Overleaf session cookie, three additional tools can send an edit to the
Overleaf review panel as a tracked-change suggestion, read existing tracked changes and
comments, and comment on a passage. The cookie stays on the user's computer.

This is an independent community project and is not affiliated with or endorsed by
Overleaf.

## Starter prompts and review cases

1. `List my Overleaf projects and summarize the default one.`
   Expected: lists only configured projects, synchronizes the selected project, and returns
   a concise inventory without changing Overleaf.
2. `Read the Introduction section and suggest three improvements without editing it.`
   Expected: reads the current remote-backed revision and returns advice; no local or remote
   file is changed.
3. `Rewrite the Introduction section, then show me the diff.`
   Expected: changes only the local clone and returns a reviewable diff. Nothing is pushed.
4. `Compile the project and report any LaTeX errors.`
   Expected: runs the local compiler when available and returns bounded diagnostic output.
   It does not publish changes.
5. `Push my pending changes to Overleaf.`
   Expected: requires approval as a destructive action, fetches collaborator changes first,
   and either pushes the reviewed change or stops with a precise conflict report.

Review should use a dedicated Overleaf test project rather than an active paper. Reviewer
credentials and any test-project URL must be supplied privately through the submission
portal or another OpenAI-approved channel, never committed to this repository.

## Request to OpenAI

**Subject:** Local MCP support request for public plugin submission — Overleaf

> I maintain `mcp-server-overleaf`, a public MIT-licensed MCP server for safely reading and
> editing Overleaf papers. It is published on npm, listed in the official MCP Registry, and
> packaged as repository plugins for Codex and Claude Code plus a desktop MCP bundle.
>
> The server is local by design: each user's Overleaf Git token and project clone stay on
> their computer, and the project operator receives no user data. It exposes private project
> reads and explicit write actions, so presenting it as an anonymous public HTTPS MCP server
> would be unsafe. Moving it to a hosted multi-tenant service would also materially change
> the published privacy model and require an OAuth 2.1 identity and credential-storage
> architecture.
>
> OpenAI's submission documentation says developers who cannot deploy a local MCP server to
> a public HTTPS URL should contact OpenAI about local MCP support. Could you confirm whether
> this project can enter review through a supported local-MCP or tunnel-backed plugin path?
> I can provide a dedicated reviewer Overleaf project and credentials privately once the
> supported review mechanism is confirmed.
>
> Repository: https://github.com/yangzichao/mcp-server-overleaf
> npm: https://www.npmjs.com/package/mcp-server-overleaf
> MCP Registry name: io.github.yangzichao/mcp-server-overleaf
> Privacy policy: https://github.com/yangzichao/mcp-server-overleaf/blob/main/docs/privacy-policy.md

## Hosted-service boundary

Do not build or advertise a hosted multi-tenant edition merely to satisfy the submission
form. That edition would need a separate threat model, OAuth 2.1 authorization server,
encrypted credential lifecycle, tenant-isolated storage and clones, abuse controls,
retention and deletion guarantees, operational monitoring, incident response, updated
privacy policy and terms, and a production domain. It should be treated as a separate
product decision, not a packaging change.
