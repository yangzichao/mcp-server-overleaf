import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { countDevelopmentEntries, pruneDevelopmentEntries } from "./pruneDevelopmentEntries.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export const developmentShrinkwrapPath = join(packageRoot, "npm-shrinkwrap.json");

/**
 * `npm pack` runs `postpack` only when packing succeeded, so a failed pack would otherwise
 * leave the runtime-only lock in place and a later `npm ci` would install no development
 * tooling. This backup is the marker for that window: whoever runs next puts the full lock
 * back before doing anything else, and Git ignores the file so it cannot be committed.
 */
export const developmentShrinkwrapBackupPath = join(packageRoot, "npm-shrinkwrap.development.json");

export function restoreDevelopmentShrinkwrap() {
  if (!existsSync(developmentShrinkwrapBackupPath)) return false;
  renameSync(developmentShrinkwrapBackupPath, developmentShrinkwrapPath);
  return true;
}

export function installShippedShrinkwrap() {
  const recoveredFromFailedPack = restoreDevelopmentShrinkwrap();
  const developmentShrinkwrap = JSON.parse(readFileSync(developmentShrinkwrapPath, "utf8"));
  const shippedShrinkwrap = pruneDevelopmentEntries(developmentShrinkwrap);

  copyFileSync(developmentShrinkwrapPath, developmentShrinkwrapBackupPath);
  writeFileSync(developmentShrinkwrapPath, `${JSON.stringify(shippedShrinkwrap, null, 2)}\n`);

  return {
    recoveredFromFailedPack,
    removedEntryCount: countDevelopmentEntries(developmentShrinkwrap),
    shippedEntryCount: Object.keys(shippedShrinkwrap.packages).length,
  };
}
