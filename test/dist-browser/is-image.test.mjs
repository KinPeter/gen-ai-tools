import { describe, expect, it } from "vitest";
import {
  IMAGE_EXTENSIONS,
  isImageFile,
} from "../../dist-browser/src/utils/is-image.mjs";

describe("isImageFile", () => {
  it("accepts every extension the server serves", () => {
    for (const ext of IMAGE_EXTENSIONS) {
      expect(isImageFile({ name: `photo.${ext}`, type: "file", ext })).toBe(
        true,
      );
    }
  });

  it("rejects folders, dot-directories and non-image files", () => {
    expect(isImageFile({ name: "archive", type: "folder" })).toBe(false);
    expect(isImageFile({ name: ".trash", type: "folder" })).toBe(false);
    expect(isImageFile({ name: "notes.txt", type: "file", ext: "txt" })).toBe(
      false,
    );
  });

  it("tolerates a missing entry", () => {
    expect(isImageFile(null)).toBe(false);
    expect(isImageFile(undefined)).toBe(false);
  });
});
