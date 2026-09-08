# Related projects

Checked on 2026-09-08. This is a comparison of public documentation and registry metadata,
not an independent audit of the implementations or a claim that this project is the first.

| Project | Publicly documented approach |
| --- | --- |
| [OverleafMCP](https://github.com/mjyoo2/OverleafMCP) | Git-based access, LaTeX structure, section edits, and an npm command, `@mjyoo2/overleaf-mcp` (registry version 1.0.0 at the time checked). |
| [overleaf-git-mcp](https://github.com/Junfei-Z/overleaf-git-mcp) | Git bridge, targeted patching, sparse checkout, diff-based re-reading, multiple projects, and explicit pushes. |
| [Overleaf-MCP-Server](https://github.com/AllanVester/Overleaf-MCP-Server) | Browser-session HTTP reads and Playwright operations for editor features such as comments and tracked suggestions. |

This project's intended focus is collaborator safety and recovery: synchronize before
reads and edits, keep writes local, refuse conflicting pushes, preserve pending work,
and verify the behavior over stdio and authenticated HTTP. Release checks also exercise
the installed npm artifact. These are observable requirements in this repository; they
are not assertions that another project lacks equivalent safeguards.

Git integration still requires a qualifying Overleaf account, and local compilation
requires local TeX tools. The project is independent of Overleaf and does not offer the
browser editor's complete feature set.
