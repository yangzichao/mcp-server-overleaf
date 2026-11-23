import { describe, expect, it } from "vitest";

import { parseTexcountReport } from "../../../src/workflow/wordCount/parseTexcountReport.js";

/*
 * What TeXcount 3.1.1 printed for `texcount -nocol -inc` on 2026-11-22.
 *
 * The first document is main.tex with a heading and some text, then \input{sections/method},
 * \include{appendix} and \input{missing}. The second defines a counter for \cite with
 * %TC:newcounter. The third run names a main file that does not exist.
 */
const SEVERAL_FILES = [
  "",
  "!!! File missing not found in path [./]. !!!",
  "File: ./main.tex",
  "Encoding: ascii",
  "Words in text: 6",
  "Words in headers: 3",
  "Words outside text (captions, etc.): 3",
  "Number of headers: 2",
  "Number of floats/tables/figures: 1",
  "Number of math inlines: 1",
  "Number of math displayed: 1",
  "Subcounts:",
  "  text+headers+captions (#headers/#floats/#inlines/#displayed)",
  "  0+2+0 (1/0/0/0) _top_",
  "  6+1+3 (1/1/1/1) Section: Introduction",
  "",
  "Included file: ./sections/method.tex",
  "Encoding: utf8",
  "Words in text: 9",
  "Words in headers: 1",
  "Words outside text (captions, etc.): 0",
  "Number of headers: 1",
  "Number of floats/tables/figures: 0",
  "Number of math inlines: 0",
  "Number of math displayed: 0",
  "",
  "Included file: ./appendix.tex",
  "Encoding: ascii",
  "Words in text: 3",
  "Words in headers: 1",
  "Words outside text (captions, etc.): 0",
  "Number of headers: 1",
  "Number of floats/tables/figures: 0",
  "Number of math inlines: 0",
  "Number of math displayed: 0",
  "",
  "Sum of files: ./main.tex",
  "File(s) total: ./main.tex",
  "Words in text: 18",
  "Words in headers: 5",
  "Words outside text (captions, etc.): 3",
  "Number of headers: 4",
  "Number of floats/tables/figures: 1",
  "Number of math inlines: 1",
  "Number of math displayed: 1",
  "Files: 3",
  "Subcounts:",
  "  text+headers+captions (#headers/#floats/#inlines/#displayed)",
  "  6+3+3 (2/1/1/1) File: ./main.tex",
  "  9+1+0 (1/0/0/0) Included file: ./sections/method.tex",
  "  3+1+0 (1/0/0/0) Included file: ./appendix.tex",
  "",
  "(errors:1)",
  "",
].join("\n");
const ONE_FILE_WITH_COUNTER = [
  "File: ./counter.tex",
  "Encoding: ascii",
  "Words in text: 5",
  "Words in headers: 1",
  "Words outside text (captions, etc.): 0",
  "Number of headers: 1",
  "Number of floats/tables/figures: 0",
  "Number of math inlines: 0",
  "Number of math displayed: 0",
  "Citations: 2",
  "Subcounts:",
  "  text+headers+captions (#headers/#floats/#inlines/#displayed)",
  "  3+0+0+1cites (0/0/0/0) _top_",
  "  2+1+0+1cites (1/0/0/0) Section: Next",
  "",
  "",
].join("\n");
const UNREADABLE_MAIN_FILE = [
  "",
  "!!! File not found or not readable: ./nope.tex !!!",
  "(errors:1)",
  "",
].join("\n");

describe("parseTexcountReport", () => {
  it("reads each file, the totals and a missing include from a document of several files", () => {
    const report = parseTexcountReport(SEVERAL_FILES);

    expect(report.totals).toEqual({
      wordsInText: 18,
      wordsInHeaders: 5,
      wordsOutsideText: 3,
      headers: 4,
      floats: 1,
      inlineMath: 1,
      displayedMath: 1,
    });
    expect(report.files.map((file) => [file.path, file.counts.wordsInText])).toEqual([
      ["main.tex", 6],
      ["sections/method.tex", 9],
      ["appendix.tex", 3],
    ]);
    expect(report.files[0]?.sections).toEqual([
      {
        heading: "_top_",
        counts: {
          wordsInText: 0,
          wordsInHeaders: 2,
          wordsOutsideText: 0,
          headers: 1,
          floats: 0,
          inlineMath: 0,
          displayedMath: 0,
        },
      },
      {
        heading: "Section: Introduction",
        counts: {
          wordsInText: 6,
          wordsInHeaders: 1,
          wordsOutsideText: 3,
          headers: 1,
          floats: 1,
          inlineMath: 1,
          displayedMath: 1,
        },
      },
    ]);
    expect(report.files[1]?.sections).toEqual([]);
    expect(report.problems).toEqual(["File missing not found in path [./]."]);
  });

  it("takes a lone file's counts as the totals, and reads past a counter the document defines", () => {
    const report = parseTexcountReport(ONE_FILE_WITH_COUNTER);

    expect(report.totals).toEqual({
      wordsInText: 5,
      wordsInHeaders: 1,
      wordsOutsideText: 0,
      headers: 1,
      floats: 0,
      inlineMath: 0,
      displayedMath: 0,
    });
    expect(report.files).toHaveLength(1);
    expect(report.files[0]?.sections.map((section) => [section.heading, section.counts.wordsInText])).toEqual(
      [
        ["_top_", 3],
        ["Section: Next", 2],
      ],
    );
    expect(report.problems).toEqual([]);
  });

  it("passes over a line that only starts like a subcount, however long", () => {
    const lookalike = ` 0+0+0${"+00".repeat(4000)}x`;
    const started = performance.now();
    const report = parseTexcountReport(
      ONE_FILE_WITH_COUNTER.replace("Subcounts:\n", `Subcounts:\n${lookalike}\n`),
    );
    expect(performance.now() - started).toBeLessThan(1000);
    expect(report.files[0]?.sections.map((section) => section.heading)).toEqual(["_top_", "Section: Next"]);
  });

  it("has no totals when texcount could not read the main file", () => {
    expect(parseTexcountReport(UNREADABLE_MAIN_FILE)).toEqual({
      totals: undefined,
      files: [],
      problems: ["File not found or not readable: ./nope.tex"],
    });
  });
});
