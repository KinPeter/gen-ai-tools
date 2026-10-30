import { describe, expect, it } from "vitest";
import {
  entryImagePath,
  isFolderEntry,
  isParentEntry,
  joinFolderPath,
  parentEntry,
  sortEntries,
} from "../../dist-browser/src/utils/entries.mjs";

describe("joinFolderPath", () => {
  it("joins a child onto a folder path", () => {
    expect(joinFolderPath("archive/2024", "img.png")).toBe(
      "archive/2024/img.png",
    );
  });

  it("returns the bare name at the dist root", () => {
    expect(joinFolderPath("", "img.png")).toBe("img.png");
  });
});

describe("entryImagePath", () => {
  it("builds the served path for an image in a subfolder", () => {
    expect(
      entryImagePath("subfolder", { name: "a.png", type: "file", ext: "png" }),
    ).toBe("subfolder/a.png");
  });

  it("returns null for folders, the parent row and missing entries", () => {
    expect(entryImagePath("", { name: "archive", type: "folder" })).toBeNull();
    expect(entryImagePath("sub", { name: "..", type: "folder" })).toBeNull();
    expect(
      entryImagePath("", { name: "notes.txt", type: "file", ext: "txt" }),
    ).toBeNull();
    expect(entryImagePath("", null)).toBeNull();
  });
});

describe("isParentEntry / isFolderEntry", () => {
  it("recognises the virtual parent row", () => {
    expect(isParentEntry({ name: "..", type: "folder" })).toBe(true);
    expect(isParentEntry({ name: "archive", type: "folder" })).toBe(false);
    expect(isParentEntry(null)).toBe(false);
  });

  it("recognises folder entries, including the parent row", () => {
    expect(isFolderEntry({ name: "archive", type: "folder" })).toBe(true);
    expect(isFolderEntry({ name: "..", type: "folder" })).toBe(true);
    expect(isFolderEntry({ name: "a.png", type: "file", ext: "png" })).toBe(
      false,
    );
    expect(isFolderEntry(undefined)).toBe(false);
  });
});

describe("parentEntry", () => {
  it("adds the parent row everywhere but the dist root", () => {
    expect(parentEntry("archive")).toEqual({ name: "..", type: "folder" });
    expect(parentEntry("")).toBeNull();
  });
});

describe("sortEntries", () => {
  it("puts folders first, then files, each alphabetically and case-insensitively", () => {
    const entries = [
      { name: "zzz.png", type: "file", ext: "png" },
      { name: "Banana", type: "folder" },
      { name: "apple", type: "folder" },
      { name: "aaa.png", type: "file", ext: "png" },
    ];

    expect(sortEntries(entries).map((entry) => entry.name)).toEqual([
      "apple",
      "Banana",
      "aaa.png",
      "zzz.png",
    ]);
  });

  it("tolerates a missing listing", () => {
    expect(sortEntries(undefined)).toEqual([]);
  });

  it("does not reorder the array it is handed", () => {
    const entries = [
      { name: "zzz.png", type: "file", ext: "png" },
      { name: "apple", type: "folder" },
    ];

    sortEntries(entries);

    expect(entries.map((entry) => entry.name)).toEqual(["zzz.png", "apple"]);
  });
});
