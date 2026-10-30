import { describe, expect, it } from "vitest";
import { buildTitle } from "../../dist-browser/src/utils/title.mjs";

describe("buildTitle", () => {
  it('returns "Dist Browser" for an empty path', () => {
    expect(buildTitle("")).toBe("Dist Browser");
  });

  it('returns "Dist Browser" for undefined', () => {
    expect(buildTitle(undefined)).toBe("Dist Browser");
  });

  it('returns "Dist Browser" for null', () => {
    expect(buildTitle(null)).toBe("Dist Browser");
  });

  it('returns "Dist Browser · folder/" for a single-level path', () => {
    expect(buildTitle("archive")).toBe("Dist Browser · archive/");
  });

  it('returns "Dist Browser · a/b/c/" for a nested path', () => {
    expect(buildTitle("2025-11/some_folder")).toBe(
      "Dist Browser · 2025-11/some_folder/",
    );
  });

  it("appends a trailing slash to every non-empty path", () => {
    expect(buildTitle("a/b/c/d")).toBe("Dist Browser · a/b/c/d/");
  });

  it("keeps folder names with spaces verbatim", () => {
    expect(buildTitle("my folder")).toBe("Dist Browser · my folder/");
  });
});
