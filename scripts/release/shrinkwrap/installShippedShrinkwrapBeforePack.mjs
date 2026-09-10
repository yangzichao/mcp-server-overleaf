import { installShippedShrinkwrap } from "./developmentShrinkwrapSwap.mjs";

// Progress goes to stderr. `npm pack --json` puts its machine-readable result on stdout and
// the release check parses it, so anything written there is a syntax error in that JSON.
const { recoveredFromFailedPack, removedEntryCount, shippedEntryCount } = installShippedShrinkwrap();
if (recoveredFromFailedPack) {
  process.stderr.write("Recovered the development shrinkwrap left behind by a failed pack.\n");
}
process.stderr.write(
  `Shipping a runtime-only shrinkwrap: ${shippedEntryCount} entries, ${removedEntryCount} development entries removed.\n`,
);
