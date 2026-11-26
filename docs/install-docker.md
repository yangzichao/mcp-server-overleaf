# Run Overleaf MCP in Docker

The image runs the local stdio server as a non-root user. It includes Git and a basic TeX Live installation for compiling standard LaTeX documents.

Build the image from the repository root.

```bash
docker build -t mcp-server-overleaf:local .
```

Configure `OVERLEAF_PROJECT_ID` with the Overleaf project ID or project URL. Supply `OVERLEAF_GIT_TOKEN` through your MCP client's secret or environment configuration. An Overleaf session cookie in `OVERLEAF_SESSION_COOKIE` enables the editor and review tools. For the credential options, see [project configuration](project-workflows.md) and [tracked changes](tracked-changes.md).

Configure your MCP client to launch `docker` with these arguments. They inherit the selected credentials from the environment and keep local clones and pending edits in a named Docker volume.

```json
{
  "command": "docker",
  "args": [
    "run", "--rm", "-i",
    "--env", "OVERLEAF_PROJECT_ID",
    "--env", "OVERLEAF_GIT_TOKEN",
    "--env", "OVERLEAF_SESSION_COOKIE",
    "--volume", "overleaf-workspace:/home/node/.overleaf-mcp/projects",
    "mcp-server-overleaf:local"
  ]
}
```

The volume also stores local build output. Keep it if the project has unpublished edits. Local builds can use the packages included in `texlive-latex-base`. If the project needs additional packages, a configured session cookie enables compilation on Overleaf.
