import { describe, expect, it } from "vitest";
import {
  resolveUp,
  resolveRepoRoot,
} from "../../../tools-hub/utils/path.mjs";

describe("resolveUp", () => {
  it("returns the same path when levels is 0", () => {
    const input = "/home/user/project/file.mjs";
    expect(resolveUp(input, 0)).toBe(input);
  });

  it("walks up one directory", () => {
    const input = "/home/user/project/src/module.mjs";
    expect(resolveUp(input, 1)).toBe("/home/user/project/src");
  });

  it("walks up multiple directories", () => {
    const input = "/home/user/project/src/module.mjs";
    expect(resolveUp(input, 3)).toBe("/home/user");
  });

  it("handles deeply nested paths", () => {
    const input = "/a/b/c/d/e/f.g";
    expect(resolveUp(input, 2)).toBe("/a/b/c/d");
    expect(resolveUp(input, 5)).toBe("/a");
    expect(resolveUp(input, 6)).toBe("/");
  });

  it("returns root when walking past top", () => {
    const input = "/a/file.mjs";
    expect(resolveUp(input, 100)).toBe("/");
  });

  it("works with Windows-style paths (forward slashes)", () => {
    const input = "C:/Users/test/src/module.mjs";
    // dirname on Linux: "C:/Users/test/src/module.mjs"
    // level 1: "C:/Users/test/src", level 2: "C:/Users/test"
    expect(resolveUp(input, 2)).toBe("C:/Users/test");
  });
});

describe("resolveRepoRoot", () => {
  it("resolves a simple relative path from repo root", () => {
    const result = resolveRepoRoot("logging/logfinder-ui/index.html");
    expect(result).toContain("logging/logfinder-ui/index.html");
  });

  it("produces an absolute path", () => {
    const result = resolveRepoRoot("test/foo");
    expect(result.startsWith("/")).toBe(true);
  });

  it("joins correctly with a leading slash", () => {
    const result = resolveRepoRoot("/logfinder-ui/index.html");
    expect(result).toContain("logfinder-ui/index.html");
  });

  it("joins correctly with multiple segments", () => {
    const result = resolveRepoRoot("comfyui/batch.mjs");
    expect(result).toContain("comfyui/batch.mjs");
  });
});
