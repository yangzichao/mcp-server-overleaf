import { describe, expect, it } from "vitest";

import { describeFailedResponse } from "../../../src/overleaf/web/overleafWebErrors.js";

describe("describing a failed web request", () => {
  it("treats 401 as an expired session and says how to fix it", () => {
    const error = describeFailedResponse("GET", "/project/x/threads", 401, "");
    expect(error.status).toBe(401);
    expect(error.message).toContain("fresh overleaf_session2 cookie");
  });

  it("passes on Overleaf's own reason from a JSON body", () => {
    const error = describeFailedResponse(
      "POST",
      "/project/x/compile",
      500,
      JSON.stringify({ message: "clsi down" }),
    );
    expect(error.message).toBe("Overleaf answered POST /project/x/compile with status 500. clsi down");
  });

  it("reads a nested message text, as some Overleaf errors nest it", () => {
    const error = describeFailedResponse(
      "POST",
      "/p",
      400,
      JSON.stringify({ message: { text: "bad name" } }),
    );
    expect(error.message).toContain("bad name");
  });

  it("ignores an HTML error page instead of quoting it", () => {
    const error = describeFailedResponse("GET", "/p", 404, "<html><body>Not found</body></html>");
    expect(error.message).not.toContain("<html>");
    expect(error.remedy).toContain("may be wrong");
  });

  it("names the permission problem on 403 and the wait on 429", () => {
    expect(describeFailedResponse("DELETE", "/p", 403, "").remedy).toContain("Share menu");
    expect(describeFailedResponse("GET", "/p", 429, "").remedy).toContain("Wait a minute");
  });
});
