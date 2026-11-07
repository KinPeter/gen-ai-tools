import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { handleImages } from "../../../../../tools-hub/api/dist-browser/handlers/handle-images.mjs";
import { mockRes } from "../../../../support/mock-response.mjs";

const PNG_BYTES = fs.readFileSync(
  new URL("../../../../fixtures/images/tiny.png", import.meta.url),
);

describe("handleImages", () => {
  let baseDir;

  beforeEach(async () => {
    baseDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "handle-images-test-"),
    );
  });

  afterEach(async () => {
    await fs.promises.rm(baseDir, { recursive: true, force: true });
  });

  it("returns 404 for a file that is not in IMAGE_EXTENSIONS", async () => {
    await fs.promises.writeFile(
      path.join(baseDir, "notes.txt"),
      "not an image",
    );

    const res = mockRes();
    handleImages(baseDir, { url: "/api/dist-browser/images/notes.txt" }, res);

    const state = res._state();
    expect(state.status).toBe(404);
    expect(state.headers["Content-Type"]).toBe("application/json");
    expect(state.body).toEqual({ error: "Not an image file" });
  });

  it("returns 400 when no path is given", () => {
    const res = mockRes();
    handleImages(baseDir, { url: "/api/dist-browser/images" }, res);

    const state = res._state();
    expect(state.status).toBe(400);
    expect(state.body).toEqual({ error: "Empty path" });
  });

  it("returns 404 for a missing file", () => {
    const res = mockRes();
    handleImages(baseDir, { url: "/api/dist-browser/images/nope.png" }, res);

    const state = res._state();
    expect(state.status).toBe(404);
    expect(state.body).toEqual({ error: "File not found" });
  });

  it("returns 403 for a path that escapes baseDir", () => {
    const res = mockRes();
    handleImages(
      baseDir,
      { url: "/api/dist-browser/images/..%2Fsecret.png" },
      res,
    );

    const state = res._state();
    expect(state.status).toBe(403);
    expect(state.body).toEqual({ error: "Path escapes allowed directory" });
  });

  it("matches image extensions case-insensitively", async () => {
    await fs.promises.writeFile(path.join(baseDir, "UPPER.PNG"), "png-bytes");

    const res = mockRes();
    handleImages(baseDir, { url: "/api/dist-browser/images/UPPER.PNG" }, res);
    await res.waitForEnd();

    const state = res._state();
    expect(state.status).toBe(200);
    expect(state.headers["Content-Type"]).toBe("image/png");
    expect(res.bodyBytes().toString("utf8")).toBe("png-bytes");
  });

  it("streams the actual bytes of the image to the response", async () => {
    await fs.promises.writeFile(path.join(baseDir, "tiny.png"), PNG_BYTES);

    const res = mockRes();
    handleImages(baseDir, { url: "/api/dist-browser/images/tiny.png" }, res);
    await res.waitForEnd();

    const state = res._state();
    expect(state.status).toBe(200);
    expect(state.headers["Content-Type"]).toBe("image/png");

    // The body must be the streamed file, not an empty response.
    const delivered = res.bodyBytes();
    expect(delivered.length).toBe(PNG_BYTES.length);
    expect(Buffer.compare(delivered, PNG_BYTES)).toBe(0);
  });

  it("swallows a read failure that happens after the headers are sent", async () => {
    // A directory named "*.png" passes the extension gate and existsSync, but
    // createReadStream fails with EISDIR. handle-images.mjs only sends the 500
    // when `!res.headersSent`, which is never true because writeHead runs
    // before pipe — see the escalation for the dead branch at
    // tools-hub/api/dist-browser/handlers/handle-images.mjs:45-46. This test
    // pins the observable behaviour: the error is not reported.
    await fs.promises.mkdir(path.join(baseDir, "broken.png"));

    const res = mockRes();
    handleImages(baseDir, { url: "/api/dist-browser/images/broken.png" }, res);

    // Allow the stream error event to fire.
    await new Promise((resolve) => setImmediate(resolve));

    const state = res._state();
    expect(state.status).toBe(200);
    expect(res.headersSent).toBe(true);
    expect(state.body).toBeNull();
    expect(res.bodyBytes()).toHaveLength(0);
  });
});
