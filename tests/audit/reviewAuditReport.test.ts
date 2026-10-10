import { describe, expect, it } from "vitest";

// @ts-expect-error - build tooling is plain JavaScript, deliberately outside the TypeScript program.
import { acceptedAdvisories } from "../../scripts/audit/acceptedAdvisories.mjs";
// @ts-expect-error - build tooling is plain JavaScript, deliberately outside the TypeScript program.
import { reviewAuditReport } from "../../scripts/audit/reviewAuditReport.mjs";

const forgeAdvisory = {
  source: 1240912,
  name: "node-forge",
  title: "node-forge RSA PKCS#1 v1.5 signature verification accepts extra nested DigestAlgorithm elements",
  url: "https://github.com/advisories/GHSA-86w9-cpqp-85rv",
  severity: "high",
};

/** The shape `npm audit --json` reported for this repository: the advisory, and the package it reaches through. */
function auditReport(advisories: Array<Record<string, unknown>> = [forgeAdvisory]) {
  return {
    auditReportVersion: 2,
    vulnerabilities: Object.fromEntries([
      ...advisories.map((advisory) => [advisory.name, { name: advisory.name, via: [advisory] }]),
      [
        "@anthropic-ai/mcpb",
        { name: "@anthropic-ai/mcpb", via: advisories.map((advisory) => advisory.name) },
      ],
    ]),
  };
}

const forgeAcceptance = {
  advisory: "GHSA-86w9-cpqp-85rv",
  package: "node-forge",
  reviewBy: "2027-01-09",
  reason: "Development only.",
};

describe("reviewing an npm audit report", () => {
  it("passes a report with nothing in it", () => {
    expect(reviewAuditReport({ auditReportVersion: 2, vulnerabilities: {} }, [], "2026-10-09")).toEqual({
      failures: [],
      notes: [],
    });
  });

  it("fails an advisory nobody accepted, and names it", () => {
    const { failures } = reviewAuditReport(auditReport(), [], "2026-10-09");
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("node-forge GHSA-86w9-cpqp-85rv (high)");
  });

  // mcpb appears in the report only because it depends on node-forge. Accepting the
  // advisory where it lives has to be enough, or every acceptance would need its dependents.
  it("passes an accepted advisory, including the package that is only vulnerable through it", () => {
    const { failures, notes } = reviewAuditReport(auditReport(), [forgeAcceptance], "2026-10-09");
    expect(failures).toEqual([]);
    expect(notes).toEqual([
      expect.stringContaining("Accepted until 2027-01-09: node-forge GHSA-86w9-cpqp-85rv"),
    ]);
  });

  it("still fails every other advisory when one is accepted", () => {
    const otherAdvisory = {
      source: 1,
      name: "source-map-js",
      title: "source-map-js allows event-loop denial of service",
      url: "https://github.com/advisories/GHSA-68fv-2mgg-jv7q",
      severity: "high",
    };
    const { failures } = reviewAuditReport(
      auditReport([forgeAdvisory, otherAdvisory]),
      [forgeAcceptance],
      "2026-10-09",
    );
    expect(failures).toEqual([expect.stringContaining("source-map-js GHSA-68fv-2mgg-jv7q")]);
  });

  it("fails an accepted advisory once its review date has passed", () => {
    const { failures } = reviewAuditReport(auditReport(), [forgeAcceptance], "2027-01-10");
    expect(failures).toEqual([expect.stringContaining("lapsed on 2027-01-09")]);
  });

  it("holds an acceptance to the package it names", () => {
    const elsewhere = { ...forgeAcceptance, package: "some-fork-of-forge" };
    expect(reviewAuditReport(auditReport(), [elsewhere], "2026-10-09").failures).toHaveLength(1);
  });

  it("asks for an acceptance to be removed once the advisory is gone", () => {
    const report = { auditReportVersion: 2, vulnerabilities: {} };
    const { failures, notes } = reviewAuditReport(report, [forgeAcceptance], "2026-10-09");
    expect(failures).toEqual([]);
    expect(notes).toEqual([expect.stringContaining("no longer reported")]);
  });

  it("ignores an info-level advisory, as --audit-level=low did", () => {
    const informational = { ...forgeAdvisory, severity: "info" };
    expect(reviewAuditReport(auditReport([informational]), [], "2026-10-09").failures).toEqual([]);
  });

  it("refuses a report it cannot read rather than passing it", () => {
    expect(() =>
      reviewAuditReport({ error: { code: "ENOTFOUND", summary: "registry unreachable" } }, [], "2026-10-09"),
    ).toThrow(/ENOTFOUND/);
  });
});

describe("the advisories this repository accepts", () => {
  it("each name one advisory in one package, with a reason and a review date", () => {
    for (const accepted of acceptedAdvisories) {
      expect(accepted.advisory).toMatch(/^GHSA-[\w]{4}-[\w]{4}-[\w]{4}$/);
      expect(accepted.package).not.toBe("");
      expect(accepted.reviewBy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(accepted.reason.length).toBeGreaterThan(40);
    }
  });
});
