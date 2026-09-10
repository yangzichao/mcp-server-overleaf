import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { restoreDevelopmentShrinkwrap } from "../release/shrinkwrap/developmentShrinkwrapSwap.mjs";
import { listBundledTools } from "./listBundledTools.mjs";
import { renderBundleIcon } from "./renderBundleIcon.mjs";
import { renderBundleManifest } from "./renderBundleManifest.mjs";

/**
 * Builds the Claude Desktop bundle: `build/mcpb/mcp-server-overleaf-<version>.mcpb`.
 *
 * The server inside it is the same tarball npm publishes, installed with `--omit=dev`, so
 * the bundle and the npm package are the same bytes of server code rather than two builds
 * that happen to agree.
 */

const ENTRY_POINT = "server/dist/index.js";
const ICON_PATH = "icon.png";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const packageMetadata = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const mcpbCommand = join(
  packageRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "mcpb.cmd" : "mcpb",
);

const buildDirectory = join(packageRoot, "build", "mcpb");
const bundleDirectory = join(buildDirectory, "bundle");
const serverDirectory = join(bundleDirectory, "server");
const bundlePath = join(buildDirectory, `${packageMetadata.name}-${packageMetadata.version}.mcpb`);

function run(command, argumentsValue, cwd = packageRoot) {
  return execFileSync(command, argumentsValue, { cwd, encoding: "utf8", timeout: 300_000 });
}

const probeWorkspace = mkdtempSync(join(tmpdir(), "overleaf-mcpb-probe-"));
const unpackDirectory = mkdtempSync(join(tmpdir(), "overleaf-mcpb-unpack-"));

try {
  rmSync(buildDirectory, { recursive: true, force: true });
  mkdirSync(serverDirectory, { recursive: true });

  const packed = JSON.parse(run(npmCommand, ["pack", "--json", "--pack-destination", buildDirectory]))[0];
  run("tar", ["-xzf", join(buildDirectory, packed.filename), "-C", serverDirectory, "--strip-components=1"]);
  run(
    npmCommand,
    ["install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund", "--loglevel=error"],
    serverDirectory,
  );
  for (const developmentDependency of Object.keys(packageMetadata.devDependencies)) {
    assert.ok(
      !existsSync(join(serverDirectory, "node_modules", developmentDependency)),
      `The bundle would ship the development dependency ${developmentDependency}`,
    );
  }
  assert.ok(!existsSync(join(serverDirectory, ".env")), "The bundle would ship a .env file");

  const tools = await listBundledTools({
    entryPointPath: join(bundleDirectory, ENTRY_POINT),
    workspaceDirectory: probeWorkspace,
  });
  writeFileSync(join(bundleDirectory, ICON_PATH), renderBundleIcon(512));
  const manifest = renderBundleManifest({
    packageMetadata,
    tools,
    entryPoint: ENTRY_POINT,
    iconPath: ICON_PATH,
  });
  writeFileSync(join(bundleDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  run(mcpbCommand, ["validate", join(bundleDirectory, "manifest.json")]);
  run(mcpbCommand, ["pack", bundleDirectory, bundlePath]);

  // Prove the archive is installable rather than merely well-formed: unpack it the way
  // Claude Desktop does and run the entry point the manifest names.
  run(mcpbCommand, ["unpack", bundlePath, unpackDirectory]);
  const unpackedManifest = JSON.parse(readFileSync(join(unpackDirectory, "manifest.json"), "utf8"));
  assert.equal(unpackedManifest.version, packageMetadata.version);
  assert.equal(unpackedManifest.server.entry_point, ENTRY_POINT);
  assert.equal(
    run(process.execPath, [join(unpackDirectory, ENTRY_POINT), "--version"]).trim(),
    packageMetadata.version,
    "The unpacked bundle must run without a build step",
  );

  const megabytes = (statSync(bundlePath).size / 1024 / 1024).toFixed(1);
  process.stdout.write(
    `Bundled ${tools.length} tools into build/mcpb/${packageMetadata.name}-${packageMetadata.version}.mcpb (${megabytes} MB).\n`,
  );
} finally {
  rmSync(probeWorkspace, { recursive: true, force: true });
  rmSync(unpackDirectory, { recursive: true, force: true });
  // npm skips postpack when a pack fails, so close that window here as well.
  restoreDevelopmentShrinkwrap();
}
