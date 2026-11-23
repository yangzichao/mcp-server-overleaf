import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { formatCompileReport } from "../../../src/latex/formatCompileReport.js";
import type { CompileResult } from "../../../src/workflow/compileLatexProject.js";

const diagnosticLine = fc.stringMatching(/^[A-Za-z0-9 !:.\\{}]{1,20}$/).map((line) => `diagnostic ${line}`);
const compileResult: fc.Arbitrary<CompileResult> = fc.record({
  succeeded: fc.boolean(),
  mainTexFile: fc.constantFrom("main.tex", "chapters/北京.tex"),
  errorLines: fc.array(diagnosticLine, { maxLength: 5 }),
  warningLines: fc.array(diagnosticLine, { maxLength: 30 }),
  tailOfLog: fc.constantFrom("tail of the log", "Output written on main.pdf"),
});

describe("formatCompileReport properties", () => {
  it("leads with the verdict on the main file", () => {
    fc.assert(
      fc.property(compileResult, (result) => {
        const firstLine = formatCompileReport(result).split("\n")[0];
        expect(firstLine).toBe(
          `${result.succeeded ? "Compiled" : "FAILED to compile"} ${result.mainTexFile}.`,
        );
      }),
    );
  });

  it("lists every error, at most 15 warnings, and the log tail only on failure", () => {
    fc.assert(
      fc.property(compileResult, (result) => {
        const reportLines = formatCompileReport(result).split("\n");
        for (const error of result.errorLines) expect(reportLines).toContain(`  ${error}`);
        const warningSection = reportLines.indexOf("warnings:");
        const afterWarningHeading = warningSection === -1 ? [] : reportLines.slice(warningSection + 1);
        const warningSectionEnd = afterWarningHeading.indexOf("");
        const reportedWarnings =
          warningSectionEnd === -1 ? afterWarningHeading : afterWarningHeading.slice(0, warningSectionEnd);
        expect(reportedWarnings).toEqual(result.warningLines.slice(0, 15).map((warning) => `  ${warning}`));
        expect(reportLines.includes("end of log:")).toBe(!result.succeeded);
      }),
    );
  });
});
