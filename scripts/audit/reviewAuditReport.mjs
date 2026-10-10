import assert from "node:assert/strict";

/**
 * Decides whether an `npm audit --json` report passes, given the advisories accepted in
 * acceptedAdvisories.mjs.
 *
 * npm lists a vulnerable package with the advisory objects that apply to it, and lists every
 * package depending on it with that package's name in place of an advisory. Collecting the
 * advisory objects across the whole report therefore finds every advisory exactly where it
 * lives, and a package that is only vulnerable through another adds nothing of its own.
 *
 * Severity `info` is ignored, matching the `--audit-level=low` this replaces.
 */

function advisoryIdOf(advisory) {
  return advisory.url?.split("/").at(-1) ?? String(advisory.source);
}

function collectAdvisories(auditReport) {
  const advisoriesByKey = new Map();
  for (const vulnerability of Object.values(auditReport.vulnerabilities ?? {})) {
    for (const via of vulnerability.via) {
      if (typeof via !== "object" || via.severity === "info") continue;
      const advisory = { id: advisoryIdOf(via), package: via.name, severity: via.severity, title: via.title };
      advisoriesByKey.set(`${advisory.package} ${advisory.id}`, advisory);
    }
  }
  return [...advisoriesByKey.values()];
}

/** `today` is an ISO date (YYYY-MM-DD), compared as text against each `reviewBy`. */
export function reviewAuditReport(auditReport, acceptedAdvisories, today) {
  assert.equal(
    auditReport.auditReportVersion,
    2,
    `Unrecognised npm audit report${auditReport.error ? `: ${JSON.stringify(auditReport.error)}` : ""}`,
  );
  const advisories = collectAdvisories(auditReport);
  const failures = [];
  const notes = [];

  for (const advisory of advisories) {
    const description = `${advisory.package} ${advisory.id} (${advisory.severity}): ${advisory.title}`;
    const acceptance = acceptedAdvisories.find(
      (accepted) => accepted.advisory === advisory.id && accepted.package === advisory.package,
    );
    if (!acceptance) {
      failures.push(description);
    } else if (acceptance.reviewBy < today) {
      failures.push(
        `${description}. Its acceptance lapsed on ${acceptance.reviewBy}; renew it in acceptedAdvisories.mjs with a fresh reason, or fix it.`,
      );
    } else {
      notes.push(`Accepted until ${acceptance.reviewBy}: ${description}`);
    }
  }

  for (const accepted of acceptedAdvisories) {
    const stillReported = advisories.some(
      (advisory) => advisory.id === accepted.advisory && advisory.package === accepted.package,
    );
    if (!stillReported) {
      notes.push(
        `${accepted.package} ${accepted.advisory} is no longer reported; remove it from acceptedAdvisories.mjs.`,
      );
    }
  }

  return { failures, notes };
}
