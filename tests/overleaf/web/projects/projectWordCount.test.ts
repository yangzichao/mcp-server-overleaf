import { describe, expect, it } from "vitest";

import { fetchWordCount, readWordCount } from "../../../../src/overleaf/web/projects/projectWordCount.js";
import { failureOf, statusOf } from "../support/failureOf.js";
import { useFakeOverleafConnection } from "../support/fakeOverleafConnection.js";

describe("Overleaf's word count", () => {
  const connection = useFakeOverleafConnection();

  it("reads texcount's totals, and names the file and compile server the editor would", async () => {
    const count = await fetchWordCount(connection.client(), connection.overleaf.projectId, {
      filePath: "./sections/introduction.tex",
      clsiServerId: "clsi-fake-1",
    });
    expect(count).toEqual({
      textWords: 1204,
      headingWords: 17,
      wordsOutsideText: 42,
      headingCount: 6,
      floatCount: 3,
      inlineMathCount: 25,
      displayMathCount: 4,
      errorCount: 0,
      messages: "",
    });
    const [query] = connection.overleaf.web.settings.wordCountQueries;
    expect(query?.get("file")).toBe("sections/introduction.tex");
    expect(query?.get("clsiserverid")).toBe("clsi-fake-1");
  });

  it("sends no query for the main document", async () => {
    await fetchWordCount(connection.client(), connection.overleaf.projectId);
    expect(connection.overleaf.web.settings.wordCountQueries[0]?.toString()).toBe("");
  });

  it("reads missing or malformed counts as zero rather than failing", () => {
    expect(
      readWordCount({ texcount: { textWords: "many", errors: 2, messages: "  File not found  " } }),
    ).toEqual({
      textWords: 0,
      headingWords: 0,
      wordsOutsideText: 0,
      headingCount: 0,
      floatCount: 0,
      inlineMathCount: 0,
      displayMathCount: 0,
      errorCount: 2,
      messages: "File not found",
    });
    expect(readWordCount(undefined).textWords).toBe(0);
  });

  it("reports an expired session as such", async () => {
    connection.overleaf.web.sessionExpired = true;
    expect(
      statusOf(await failureOf(fetchWordCount(connection.client(), connection.overleaf.projectId))),
    ).toBe(401);
  });
});
