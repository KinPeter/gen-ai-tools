import { describe, expect, it } from "vitest";
import { buildImageUrl } from "../../dist-browser/src/utils/image-url.mjs";

describe("buildImageUrl", () => {
  it("returns null for null", () => {
    expect(buildImageUrl(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(buildImageUrl(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(buildImageUrl("")).toBeNull();
  });

  it("returns encoded URL for normal path", () => {
    expect(buildImageUrl("folder/test.png")).toBe(
      "/api/images/folder%2Ftest.png",
    );
  });

  it("encodes slashes in path", () => {
    expect(buildImageUrl("a/b/c.png")).toBe("/api/images/a%2Fb%2Fc.png");
  });

  it("encodes spaces in path", () => {
    expect(buildImageUrl("path with spaces/img.png")).toBe(
      "/api/images/path%20with%20spaces%2Fimg.png",
    );
  });
});
