import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderServerJson } from "./renderServerJson.mjs";

/**
 * Writes `build/registry/server.json` for `mcp-publisher publish`.
 *
 * The bundle hash is taken from the very file the release job uploaded, because a zip
 * records modification times and a rebuild elsewhere would not have the same bytes.
 */

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const packageMetadata = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));

const bundlePath = join(
  packageRoot,
  "build",
  "mcpb",
  `${packageMetadata.name}-${packageMetadata.version}.mcpb`,
);
const desktopBundle = existsSync(bundlePath)
  ? {
      downloadUrl: `https://github.com/yangzichao/mcp-server-overleaf/releases/download/v${packageMetadata.version}/${packageMetadata.name}-${packageMetadata.version}.mcpb`,
      fileSha256: createHash("sha256").update(readFileSync(bundlePath)).digest("hex"),
    }
  : undefined;

const outputDirectory = join(packageRoot, "build", "registry");
mkdirSync(outputDirectory, { recursive: true });
const outputPath = join(outputDirectory, "server.json");
writeFileSync(
  outputPath,
  `${JSON.stringify(renderServerJson({ packageMetadata, desktopBundle }), null, 2)}\n`,
);

process.stdout.write(
  `Wrote build/registry/server.json for ${packageMetadata.version} with ${desktopBundle ? 2 : 1} package entries.\n`,
);
