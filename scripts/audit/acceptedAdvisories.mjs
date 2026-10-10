/**
 * Advisories the repository audit lets through, each with the reason it cannot reach a user
 * and a date by which somebody looks again.
 *
 * An entry matches one advisory in one package. Once `reviewBy` passes, the advisory fails the
 * audit like any other until the entry is renewed with a fresh reason or removed. Nothing here
 * applies to the runtime tree: the package check audits a real consumer install separately,
 * with no exceptions.
 */
export const acceptedAdvisories = [
  {
    advisory: "GHSA-86w9-cpqp-85rv",
    package: "node-forge",
    reviewBy: "2027-01-09",
    reason:
      "Development only, through @anthropic-ai/mcpb, which builds the Claude Desktop bundle. The flaw is in " +
      "RSA signature verification, which mcpb reaches only from its sign, verify and info commands; this " +
      "repository runs validate, pack and unpack. No node-forge release fixes it, and 2.1.2 is the newest mcpb.",
  },
];
