// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LAST_FOLDER_KEY,
  normalizeFolderPath,
  parentFolderPath,
  readLastFolder,
  writeLastFolder,
} from "../../dist-browser/src/utils/last-folder.mjs";

// --- Lifecycle ---

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

// --- Tests ---

describe("normalizeFolderPath", () => {
  it("treats every root spelling as the empty path", () => {
    for (const value of ["", "/", "//", ".", "./", ".//", "   ", " / "]) {
      expect(normalizeFolderPath(value)).toBe("");
    }
  });

  it("strips trailing and repeated slashes", () => {
    expect(normalizeFolderPath("random/")).toBe("random");
    expect(normalizeFolderPath("/random")).toBe("random");
    expect(normalizeFolderPath("random//nested//")).toBe("random/nested");
  });

  it("keeps nested folder paths intact", () => {
    expect(normalizeFolderPath("archive/2024")).toBe("archive/2024");
    expect(normalizeFolderPath("archive/2024/nested")).toBe(
      "archive/2024/nested",
    );
  });

  it("normalizes Windows-style backslashes", () => {
    expect(normalizeFolderPath("archive\\2024\\")).toBe("archive/2024");
  });

  it("drops traversal segments instead of sending them to the API", () => {
    // A corrupt or tampered storage value must never reach the fs endpoint as
    // an escape attempt: tools-hub answers 403 and the UI would be stuck.
    expect(normalizeFolderPath("..")).toBe("");
    expect(normalizeFolderPath("../..")).toBe("");
    expect(normalizeFolderPath("./..")).toBe("");
    expect(normalizeFolderPath("..\\..")).toBe("");
    expect(normalizeFolderPath("a/../b")).toBe("b"); // matches handleFS path.resolve
    expect(normalizeFolderPath("random/../..")).toBe("");
    expect(normalizeFolderPath("random/..")).toBe("");
    expect(normalizeFolderPath("./random")).toBe("random");
  });

  it("collapses lone '.' segments inside a nested path", () => {
    expect(normalizeFolderPath("random/.")).toBe("random");
    expect(normalizeFolderPath("random/./nested")).toBe("random/nested");
  });

  it("keeps folder names verbatim but treats whitespace-only segments as root", () => {
    // Names are not trimmed, so a folder literally named " my folder " stays
    // addressable; a path made only of whitespace is just the root.
    expect(normalizeFolderPath(" my folder ")).toBe(" my folder ");
    expect(normalizeFolderPath("random/ /nested")).toBe("random/nested");
    expect(normalizeFolderPath("   ")).toBe("");
  });

  it("returns the root for non-string input", () => {
    for (const value of [null, undefined, 0, {}, [], true]) {
      expect(normalizeFolderPath(value)).toBe("");
    }
  });
});

describe("parentFolderPath", () => {
  it("returns the folder one level up", () => {
    expect(parentFolderPath("archive/2024")).toBe("archive");
    expect(parentFolderPath("archive/2024/")).toBe("archive");
    expect(parentFolderPath("a/b/c")).toBe("a/b");
  });

  it("returns the root for a top-level folder or the root itself", () => {
    for (const path of ["", "/", "random", ".", "./", "..", "a/.."]) {
      expect(parentFolderPath(path)).toBe("");
    }
  });
});

describe("writeLastFolder", () => {
  it("stores a normalized folder path", () => {
    writeLastFolder("random/");
    expect(localStorage.getItem(LAST_FOLDER_KEY)).toBe("random");
  });

  it("stores nested paths", () => {
    writeLastFolder("archive/2024");
    expect(localStorage.getItem(LAST_FOLDER_KEY)).toBe("archive/2024");
  });

  it("removes the entry when the dist root is visited", () => {
    writeLastFolder("random");
    writeLastFolder("");
    expect(localStorage.getItem(LAST_FOLDER_KEY)).toBeNull();
  });

  it("removes the entry for root spellings such as '/' and '.'", () => {
    writeLastFolder("random");
    for (const root of ["/", ".", "./", undefined, null]) {
      writeLastFolder(root);
      expect(localStorage.getItem(LAST_FOLDER_KEY)).toBeNull();
    }
  });

  it("clears a stale legacy value when navigating back to the root", () => {
    localStorage.setItem(LAST_FOLDER_KEY, "random/");
    writeLastFolder("");
    expect(localStorage.getItem(LAST_FOLDER_KEY)).toBeNull();
  });

  it("never writes back a traversal segment", () => {
    localStorage.setItem(LAST_FOLDER_KEY, "random");
    writeLastFolder("..");
    expect(localStorage.getItem(LAST_FOLDER_KEY)).toBeNull();

    writeLastFolder("a/../b");
    expect(localStorage.getItem(LAST_FOLDER_KEY)).toBe("b");
  });

  it("does not throw when localStorage is unavailable", () => {
    const original = window.localStorage;
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: () => {
          throw new Error("storage blocked");
        },
        setItem: () => {
          throw new Error("storage blocked");
        },
        removeItem: () => {
          throw new Error("storage blocked");
        },
      },
      writable: true,
    });

    try {
      expect(() => writeLastFolder("random")).not.toThrow();
      expect(readLastFolder()).toBe("");
    } finally {
      // Restore the real storage even if an assertion above throws, so later
      // tests in this file do not run against the throwing stub.
      Object.defineProperty(window, "localStorage", {
        value: original,
        writable: true,
      });
    }
  });
});

describe("readLastFolder", () => {
  it("returns the root when nothing is stored", () => {
    expect(readLastFolder()).toBe("");
  });

  it("returns the stored folder", () => {
    localStorage.setItem(LAST_FOLDER_KEY, "random");
    expect(readLastFolder()).toBe("random");
  });

  it("normalizes legacy values left in storage", () => {
    for (const [stored, expected] of [
      ["random/", "random"],
      ["/random", "random"],
      ["archive//2024/", "archive/2024"],
      ["", ""],
      ["/", ""],
      [".", ""],
      ["..", ""],
      ["archive/./2024/", "archive/2024"],
    ]) {
      localStorage.setItem(LAST_FOLDER_KEY, stored);
      expect(readLastFolder()).toBe(expected);
    }
  });

  it("uses the same key the write path uses", () => {
    writeLastFolder("random");
    expect(localStorage.getItem(LAST_FOLDER_KEY)).not.toBeNull();
    expect(readLastFolder()).toBe("random");
  });
});
