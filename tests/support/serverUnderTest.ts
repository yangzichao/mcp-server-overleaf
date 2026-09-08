import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const checkoutDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Release checks redirect the existing protocol tests to an installed tarball.
export const serverEntryPoint =
  process.env.OVERLEAF_TEST_SERVER_ENTRYPOINT ?? resolve(checkoutDirectory, "dist/index.js");
export const serverWorkingDirectory = process.env.OVERLEAF_TEST_SERVER_CWD ?? checkoutDirectory;
