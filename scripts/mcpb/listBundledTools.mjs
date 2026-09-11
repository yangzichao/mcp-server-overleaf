import { spawn } from "node:child_process";

/**
 * Reads the tool surface back out of the server that is about to be packed.
 *
 * Listing tools needs configuration to be present but never used, so the probe passes a
 * placeholder token and project id and points the workspace at a throwaway directory.
 * Nothing here reaches Overleaf.
 */

const PROBE_ENVIRONMENT = {
  OVERLEAF_GIT_TOKEN: "manifest-probe-token",
  OVERLEAF_PROJECT_ID: "0".repeat(24),
  // The review tools are registered only when a session cookie is configured, and the manifest
  // should list every tool the bundle can offer, not only the ones an unconfigured server has.
  OVERLEAF_SESSION_COOKIE: "manifest-probe-cookie",
};

const REQUESTS = [
  {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "mcpb-manifest-probe", version: "1" },
    },
  },
  { jsonrpc: "2.0", method: "notifications/initialized" },
  { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
];

/** The reply may arrive split across chunks, so every complete line is re-read each time. */
function findToolsListResponse(standardOutput) {
  for (const line of standardOutput.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const message = JSON.parse(line);
      if (message.id === 2) return message;
    } catch {
      // A partial line; the next chunk completes it.
    }
  }
  return null;
}

export function listBundledTools({ entryPointPath, workspaceDirectory, timeoutMs = 30_000 }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entryPointPath, "--stdio"], {
      env: {
        ...process.env,
        ...PROBE_ENVIRONMENT,
        OVERLEAF_MCP_WORKSPACE_DIR: workspaceDirectory,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let standardOutput = "";
    let standardError = "";
    const finish = (error, tools) => {
      clearTimeout(deadline);
      child.kill("SIGTERM");
      if (error) reject(error);
      else resolve(tools);
    };
    const deadline = setTimeout(
      () => finish(new Error(`The packed server did not list its tools within ${timeoutMs} ms.`)),
      timeoutMs,
    );

    child.stderr.on("data", (chunk) => {
      standardError += chunk;
    });
    child.on("error", (error) => finish(error));
    child.on("exit", (code) => {
      if (standardOutput.includes('"id":2')) return;
      finish(new Error(`The packed server exited with code ${code} before listing tools.\n${standardError}`));
    });

    child.stdout.on("data", (chunk) => {
      standardOutput += chunk;
      const response = findToolsListResponse(standardOutput);
      if (!response) return;
      if (response.error) finish(new Error(`tools/list failed: ${response.error.message}`));
      else finish(null, response.result.tools);
    });

    for (const request of REQUESTS) child.stdin.write(`${JSON.stringify(request)}\n`);
  });
}
