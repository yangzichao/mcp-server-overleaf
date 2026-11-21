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
    advisory: "GHSA-mrhx-c7xc-m3w5",
    package: "zod",
    reviewBy: "2027-01-17",
    reason:
      "Development only: zod 3.25 nested under @anthropic-ai/mcpb, which builds the Claude Desktop bundle. The " +
      "flaw needs an attacker-supplied oversized array; mcpb validates only the manifest this repository " +
      "renders itself. The fix is zod 4.6.6 and no 3.x release has it; 2.1.2 is the newest mcpb. The server " +
      "itself runs zod 4.6.7.",
  },
];
