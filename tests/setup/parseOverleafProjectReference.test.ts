import { describe, expect, it } from "vitest";
import { parseOverleafProjectReference } from "../../src/setup/inputs/parseOverleafProjectReference.js";
import { SetupError } from "../../src/setup/setupError.js";

describe("parseOverleafProjectReference", () => {
  it("accepts the address bar url of an open project", () => {
    expect(parseOverleafProjectReference("https://www.overleaf.com/project/64a1b2c3d4e5f6a7b8c9d0e1")).toBe(
      "64a1b2c3d4e5f6a7b8c9d0e1",
    );
  });

  it("ignores anything after the project id", () => {
    expect(
      parseOverleafProjectReference("https://www.overleaf.com/project/64A1B2C3D4E5F6A7B8C9D0E1#panel=1"),
    ).toBe("64a1b2c3d4e5f6a7b8c9d0e1");
  });

  it("accepts a bare project id", () => {
    expect(parseOverleafProjectReference("  64a1b2c3d4e5f6a7b8c9d0e1  ")).toBe("64a1b2c3d4e5f6a7b8c9d0e1");
  });

  it("names the problem when given a read-only share link", () => {
    expect(() => parseOverleafProjectReference("https://www.overleaf.com/read/qwertyuiopas")).toThrow(
      /share link/i,
    );
  });

  it("refuses anything without a project id", () => {
    expect(() => parseOverleafProjectReference("my paper")).toThrow(SetupError);
  });
});
