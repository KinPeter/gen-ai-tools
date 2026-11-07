import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleFS } from "../../../../../tools-hub/api/dist-browser/handlers/handle-fs.mjs";
import { mockRes } from "../../../../support/mock-response.mjs";

describe("handleFS", () => {
  let baseDir;

  beforeEach(async () => {
    baseDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "handle-fs-test-"),
    );
    await fs.promises.mkdir(path.join(baseDir, "shots"), { recursive: true });
    await fs.promises.writeFile(path.join(baseDir, "shots/a.png"), "png");
    await fs.promises.writeFile(path.join(baseDir, "notes.txt"), "text");
  });

  afterEach(async () => {
    await fs.promises.rm(baseDir, { recursive: true, force: true });
  });

  it("lists folders and image files, skipping other file types", () => {
    const res = mockRes();
    handleFS(baseDir, { url: "/api/dist-browser/fs/" }, res);

    const state = res._state();
    expect(state.status).toBe(200);
    expect(state.body.path).toBe("");
    // notes.txt is not in IMAGE_EXTENSIONS, so it is not listed at all.
    expect(state.body.entries).toEqual([{ name: "shots", type: "folder" }]);
  });

  it("lists image files in a nested directory", () => {
    const res = mockRes();
    handleFS(baseDir, { url: "/api/dist-browser/fs/shots" }, res);

    const state = res._state();
    expect(state.status).toBe(200);
    expect(state.body.path).toBe("shots");
    expect(state.body.entries).toEqual([
      { name: "a.png", type: "file", ext: "png" },
    ]);
  });

  it("returns 500 when reading the directory fails", () => {
    // The directory exists, so the only way to reach the 500 branch is a
    // failing readdirSync.
    const readdirSpy = vi.spyOn(fs, "readdirSync").mockImplementation(() => {
      throw new Error("EIO: simulated read failure");
    });

    try {
      const res = mockRes();
      handleFS(baseDir, { url: "/api/dist-browser/fs/shots" }, res);

      const state = res._state();
      expect(state.status).toBe(500);
      expect(state.body).toEqual({ error: "Failed to read directory" });
    } finally {
      readdirSpy.mockRestore();
    }
  });
});
