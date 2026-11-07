import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handleTrash } from "../../../../../tools-hub/api/dist-browser/handlers/handle-trash.mjs";
import { mockReq, mockRes } from "../../../../support/mock-response.mjs";

describe("handleTrash", () => {
  let baseDir;

  beforeEach(async () => {
    baseDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "handle-trash-test-"),
    );
  });

  afterEach(async () => {
    await fs.promises.rm(baseDir, { recursive: true, force: true });
  });

  it("reports an error for a path that does not exist", async () => {
    const res = mockRes();
    await handleTrash(
      baseDir,
      mockReq("/api/dist-browser/trash", "POST", {
        paths: ["no-such-file.png"],
      }),
      res,
    );

    const state = res._state();
    expect(state.status).toBe(200);
    expect(state.body.ok).toBe(false);
    expect(state.body.errors).toEqual([
      { path: "no-such-file.png", error: "Not found" },
    ]);
    expect(fs.existsSync(path.join(baseDir, ".trash"))).toBe(true);
  });

  it("renames a colliding entry in .trash instead of overwriting it", async () => {
    await fs.promises.mkdir(path.join(baseDir, "images"), { recursive: true });
    await fs.promises.writeFile(path.join(baseDir, "photo.png"), "first");
    await fs.promises.writeFile(
      path.join(baseDir, "images", "photo.png"),
      "second",
    );

    const res = mockRes();
    await handleTrash(
      baseDir,
      mockReq("/api/dist-browser/trash", "POST", {
        paths: ["photo.png", "images/photo.png"],
      }),
      res,
    );

    expect(res._state().status).toBe(200);
    expect(res._state().body.ok).toBe(true);
    expect(res._state().body.errors).toEqual([]);

    const trashed = fs.readdirSync(path.join(baseDir, ".trash"));
    expect(trashed).toHaveLength(2);
    expect(trashed.filter((name) => name === "photo.png")).toHaveLength(1);
    const renamed = trashed.filter(
      (name) => name !== "photo.png" && /^photo\.[0-9TZ-]+\.png$/.test(name),
    );
    expect(renamed).toHaveLength(1);

    // Both originals are gone, and both bodies survived.
    expect(fs.existsSync(path.join(baseDir, "photo.png"))).toBe(false);
    expect(fs.existsSync(path.join(baseDir, "images", "photo.png"))).toBe(
      false,
    );
    const contents = trashed.map((name) =>
      fs.readFileSync(path.join(baseDir, ".trash", name), "utf8"),
    );
    expect(contents.sort()).toEqual(["first", "second"]);
  });

  it("returns 500 when .trash cannot be created", async () => {
    // A regular file where the trash directory would go makes mkdirSync throw.
    await fs.promises.writeFile(
      path.join(baseDir, ".trash"),
      "not a directory",
    );
    await fs.promises.writeFile(path.join(baseDir, "photo.png"), "data");

    const res = mockRes();
    await handleTrash(
      baseDir,
      mockReq("/api/dist-browser/trash", "POST", { paths: ["photo.png"] }),
      res,
    );

    const state = res._state();
    expect(state.status).toBe(500);
    expect(state.body).toEqual({ error: "Failed to create trash directory" });
    expect(fs.existsSync(path.join(baseDir, "photo.png"))).toBe(true);
  });
});
