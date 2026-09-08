import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { FakeOverleafRemote } from "./fakeOverleafRemote.js";
import { McpStdioClient } from "./mcpStdioClient.js";

it("reads an external configuration file outside the install and working directory", async () => {
  const remote = await FakeOverleafRemote.create();
  let client: McpStdioClient | undefined;
  try {
    await remote.collaboratorPushes("main.tex", "External configuration works.\n", "Initial document");
    const configurationPath = join(remote.rootDirectory, "config with spaces.env");
    await writeFile(
      configurationPath,
      Object.entries(remote.environment())
        .map(([name, value]) => `${name}="${value}"`)
        .join("\n"),
      { mode: 0o600 },
    );
    client = await McpStdioClient.start({ OVERLEAF_MCP_ENV_FILE: configurationPath });
    expect(await client.call("read_file", { path: "main.tex" })).toContain("External configuration works.");
  } finally {
    await client?.stop();
    remote.cleanUp();
  }
});
