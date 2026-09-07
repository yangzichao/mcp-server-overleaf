import { describe, expect, it } from "vitest";

import { formatCompileReport } from "../../src/latex/formatCompileReport.js";
import type { CompileResult } from "../../src/workflow/compileLatexProject.js";

function result(overrides: Partial<CompileResult> = {}): CompileResult {
  return {
    succeeded: true,
    mainTexFile: "main.tex",
    errorLines: [],
    warningLines: [],
    tailOfLog: "",
    ...overrides,
  } as CompileResult;
}

describe("formatCompileReport", () => {
  it("leads with the verdict", () => {
    expect(formatCompileReport(result())).toBe("Compiled main.tex.");
    expect(formatCompileReport(result({ succeeded: false }))).toContain("FAILED to compile main.tex.");
  });

  it("lists errors under a heading", () => {
    const report = formatCompileReport(
      result({ succeeded: false, errorLines: ["! Undefined control sequence."] }),
    );
    expect(report).toContain("errors:");
    expect(report).toContain("  ! Undefined control sequence.");
  });

  it("includes the tail of the log only on failure", () => {
    expect(formatCompileReport(result({ tailOfLog: "last lines" }))).not.toContain("last lines");
    expect(formatCompileReport(result({ succeeded: false, tailOfLog: "last lines" }))).toContain(
      "last lines",
    );
  });

  // A run with hundreds of overfull-hbox warnings would otherwise bury the errors.
  it("caps the warnings it reports", () => {
    const warnings = Array.from({ length: 40 }, (_, index) => `warning ${index}`);
    const report = formatCompileReport(result({ warningLines: warnings }));
    expect(report).toContain("warning 14");
    expect(report).not.toContain("warning 15");
  });

  it("omits empty sections entirely", () => {
    expect(formatCompileReport(result())).not.toContain("warnings:");
    expect(formatCompileReport(result())).not.toContain("errors:");
  });
});
