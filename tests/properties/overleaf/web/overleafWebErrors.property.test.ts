import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  describeFailedResponse,
  OverleafWebRequestError,
} from "../../../../src/overleaf/web/overleafWebErrors.js";

const method = fc.constantFrom("GET", "POST", "DELETE");
const requestPath = fc.constantFrom(
  "/project/64a1b2c3d4e5f60718293a4b/doc/x",
  "/user/projects",
  "/project/北京",
);
const status = fc.oneof(
  fc.constantFrom(400, 401, 403, 404, 429, 500, 502),
  fc.integer({ min: 100, max: 599 }),
);
const responseBody = fc.oneof(
  fc.string(),
  fc.jsonValue().map((value) => JSON.stringify(value)),
  fc.constantFrom("null", "[]", '"text"', "<html><body>Oops</body></html>"),
);
const overleafReason = fc.stringMatching(/^[A-Za-z][A-Za-z ,.]{0,30}$/);

describe("describeFailedResponse properties", () => {
  it("never throws, and always gives an OverleafWebRequestError carrying the status", () => {
    fc.assert(
      fc.property(method, requestPath, status, responseBody, (verb, path, code, body) => {
        const error = describeFailedResponse(verb, path, code, body);
        expect(error).toBeInstanceOf(OverleafWebRequestError);
        expect(error.status).toBe(code);
      }),
    );
  });

  it("names the request it describes, except for an expired session", () => {
    fc.assert(
      fc.property(method, requestPath, status, responseBody, (verb, path, code, body) => {
        fc.pre(code !== 401);
        expect(describeFailedResponse(verb, path, code, body).message).toContain(`${verb} ${path}`);
      }),
    );
  });

  it("passes on Overleaf's own reason from a JSON message, error or nested message text", () => {
    fc.assert(
      fc.property(
        method,
        requestPath,
        status,
        overleafReason,
        fc.constantFrom("message", "error", "nested"),
        (verb, path, code, reason, shape) => {
          fc.pre(code !== 401 && code !== 429);
          const body = JSON.stringify(
            shape === "nested" ? { message: { text: reason } } : { [shape]: reason },
          );
          expect(describeFailedResponse(verb, path, code, body).message).toContain(reason);
        },
      ),
    );
  });

  it("never quotes a body that is not JSON", () => {
    fc.assert(
      fc.property(method, requestPath, status, fc.string(), (verb, path, code, page) => {
        const body = `<html><body>MARKER-${page}</body></html>`;
        expect(describeFailedResponse(verb, path, code, body).message).not.toContain("MARKER-");
      }),
    );
  });
});
