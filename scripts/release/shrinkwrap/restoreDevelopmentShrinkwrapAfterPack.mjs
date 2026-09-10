import { restoreDevelopmentShrinkwrap } from "./developmentShrinkwrapSwap.mjs";

// Progress goes to stderr. `npm pack --json` puts its machine-readable result on stdout and
// the release check parses it, so anything written there is a syntax error in that JSON.
process.stderr.write(
  restoreDevelopmentShrinkwrap()
    ? "Restored the development shrinkwrap.\n"
    : "No shipped shrinkwrap was in place; left the development shrinkwrap alone.\n",
);
