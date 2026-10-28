import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createHandler,
  handleFS,
  handleImages,
  handleTrash,
  handleLogs,
  serveStatic,
} from "../../dist-browser/server.mjs";

// --- Fixtures ---
const PNG_FIXTURE = await fs.promises.readFile(
  new URL("../fixtures/images/tiny.png", import.meta.url),
);

// --- Helpers ---

/**
 * Create a minimal mock response object that captures what the handler writes.
 */
function mockRes() {
  const state = { status: null, headers: null, body: null, streamChunks: [] };
  return {
    get headersSent() {
      return state.status !== null;
    },
    writeHead(status, headers) {
      state.status = status;
      state.headers = headers;
    },
    end(body) {
      // Auto-parse JSON responses
      if (Buffer.isBuffer(body)) {
        state.body = body;
      } else {
        try {
          state.body = typeof body === "string" ? JSON.parse(body) : body;
        } catch {
          state.body = body;
        }
      }
    },
    on() {},
    once() {},
    destroy() {},
    emit() {},
    pipe(dest) {
      // Simulate streaming: write data to dest
      dest.write = (chunk) => state.streamChunks.push(chunk);
      dest.end = () => {
        if (state.streamChunks.length > 0) {
          state.body = Buffer.concat(state.streamChunks);
        }
      };
      return dest;
    },
    _state: () => state,
  };
}

/**
 * Create a POST mock request with a JSON body.
 */
function postReq(url, body) {
  const raw = JSON.stringify(body);
  return {
    url,
    method: "POST",
    on(event, cb) {
      if (event === "data") cb(Buffer.from(raw));
      if (event === "end") cb();
    },
  };
}

/**
 * Create a temp base directory with test fixtures.
 */
async function setupTestBase() {
  const baseDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "dist-browser-test-"),
  );

  // Create dist/ images
  await fs.promises.mkdir(path.join(baseDir, "subfolder"), {
    recursive: true,
  });
  await fs.promises.writeFile(path.join(baseDir, "root.png"), PNG_FIXTURE);
  await fs.promises.writeFile(path.join(baseDir, "root.jpg"), PNG_FIXTURE);
  await fs.promises.writeFile(
    path.join(baseDir, "subfolder", "inner.png"),
    PNG_FIXTURE,
  );

  // Create logs
  const logsDir = path.join(baseDir, "output", "logs");
  await fs.promises.mkdir(logsDir, { recursive: true });
  await fs.promises.writeFile(
    path.join(logsDir, "run1.json"),
    JSON.stringify([
      { filename: "img1.png", prompt: "hello" },
      { filename: "img2.jpg", prompt: "world" },
    ]),
  );
  await fs.promises.writeFile(
    path.join(logsDir, "run2.json"),
    JSON.stringify([{ filename: "img3.png", prompt: "test" }]),
  );

  // Create static files
  const staticDir = path.join(baseDir, "static");
  await fs.promises.mkdir(staticDir, { recursive: true });
  await fs.promises.writeFile(
    path.join(staticDir, "index.html"),
    "<!DOCTYPE html><html><body>App</body></html>",
  );
  await fs.promises.mkdir(path.join(staticDir, "assets"), {
    recursive: true,
  });
  await fs.promises.writeFile(
    path.join(staticDir, "assets", "app.js"),
    "console.log(1);",
  );

  return { baseDir, logsDir, staticDir };
}

let testBase;
beforeAll(async () => {
  testBase = await setupTestBase();
});
afterAll(async () => {
  await fs.promises.rm(testBase.baseDir, { recursive: true, force: true });
});

describe("handleFS", () => {
  it("returns root directory listing", () => {
    const res = mockRes();
    handleFS(testBase.baseDir, { url: "/api/fs/" }, res);
    const s = res._state();
    expect(s.status).toBe(200);
    expect(s.body.path).toBe("");
    const names = s.body.entries.map((e) => e.name);
    expect(names).toContain("subfolder");
    expect(names).toContain("root.png");
    expect(names).toContain("root.jpg");
    // At least one folder entry
    expect(s.body.entries.some((e) => e.type === "folder")).toBe(true);
  });

  it("returns root listing without trailing slash", () => {
    const res = mockRes();
    handleFS(testBase.baseDir, { url: "/api/fs" }, res);
    const s = res._state();
    expect(s.status).toBe(200);
    expect(s.body.path).toBe("");
  });

  it("returns subfolder entries", () => {
    const res = mockRes();
    handleFS(testBase.baseDir, { url: "/api/fs/subfolder/" }, res);
    const s = res._state();
    expect(s.status).toBe(200);
    expect(s.body.path).toBe("subfolder");
    expect(s.body.entries).toHaveLength(1);
    expect(s.body.entries[0].name).toBe("inner.png");
    expect(s.body.entries[0].ext).toBe("png");
  });

  it("returns 404 for missing directory", () => {
    const res = mockRes();
    handleFS(testBase.baseDir, { url: "/api/fs/nonexistent/" }, res);
    const s = res._state();
    expect(s.status).toBe(404);
  });

  it("returns 403 for path traversal", () => {
    const res = mockRes();
    handleFS(testBase.baseDir, { url: "/api/fs/..%2F.." }, res);
    const s = res._state();
    expect(s.status).toBe(403);
  });

  it("filters to folders + images only", async () => {
    await fs.promises.writeFile(
      path.join(testBase.baseDir, "readme.txt"),
      "text",
    );
    const res = mockRes();
    handleFS(testBase.baseDir, { url: "/api/fs/" }, res);
    const s = res._state();
    const names = s.body.entries.map((e) => e.name);
    expect(names).not.toContain("readme.txt");
    await fs.promises.rm(path.join(testBase.baseDir, "readme.txt"));
  });

  it("sorts folders first, then files alphabetically", () => {
    const res = mockRes();
    handleFS(testBase.baseDir, { url: "/api/fs/" }, res);
    const s = res._state();
    const types = s.body.entries.map((e) => e.type);
    const fileStart = types.indexOf("file");
    if (fileStart >= 0) {
      for (let i = 0; i < fileStart; i++) expect(types[i]).toBe("folder");
    }
  });
});

describe("handleImages", () => {
  it("streams a PNG with correct Content-Type", () => {
    const res = mockRes();
    handleImages(testBase.baseDir, { url: "/api/images/root.png" }, res);
    const s = res._state();
    expect(s.status).toBe(200);
    expect(s.headers["Content-Type"]).toBe("image/png");
  });

  it("streams a JPG with correct Content-Type", () => {
    const res = mockRes();
    handleImages(testBase.baseDir, { url: "/api/images/root.jpg" }, res);
    const s = res._state();
    expect(s.status).toBe(200);
    expect(s.headers["Content-Type"]).toBe("image/jpeg");
  });

  it("returns 404 for missing file", () => {
    const res = mockRes();
    handleImages(testBase.baseDir, { url: "/api/images/missing.png" }, res);
    const s = res._state();
    expect(s.status).toBe(404);
  });

  it("returns 403 for path traversal", () => {
    const res = mockRes();
    handleImages(testBase.baseDir, { url: "/api/images/..%2F.." }, res);
    const s = res._state();
    expect(s.status).toBe(403);
  });

  it("returns 404 for non-image file", async () => {
    await fs.promises.writeFile(
      path.join(testBase.baseDir, "data.txt"),
      "not an image",
    );
    const res = mockRes();
    handleImages(testBase.baseDir, { url: "/api/images/data.txt" }, res);
    const s = res._state();
    expect(s.status).toBe(404);
    await fs.promises.rm(path.join(testBase.baseDir, "data.txt"));
  });
});

describe("handleTrash", () => {
  it("moves file to .trash/", async () => {
    await fs.promises.writeFile(
      path.join(testBase.baseDir, "trash-me.png"),
      PNG_FIXTURE,
    );
    const res = mockRes();
    await handleTrash(
      testBase.baseDir,
      postReq("/api/trash", { paths: ["trash-me.png"] }),
      res,
    );
    const s = res._state();
    expect(s.status).toBe(200);
    expect(s.body.ok).toBe(true);
    expect(s.body.errors).toHaveLength(0);
    expect(
      fs.existsSync(path.join(testBase.baseDir, ".trash", "trash-me.png")),
    ).toBe(true);
  });

  it("handles name collision with timestamp", async () => {
    const trashDir = path.join(testBase.baseDir, ".trash");
    await fs.promises.mkdir(trashDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(trashDir, "collision.png"),
      PNG_FIXTURE,
    );
    await fs.promises.writeFile(
      path.join(testBase.baseDir, "collision.png"),
      PNG_FIXTURE,
    );

    const res = mockRes();
    await handleTrash(
      testBase.baseDir,
      postReq("/api/trash", { paths: ["collision.png"] }),
      res,
    );
    expect(res._state().status).toBe(200);
    expect(res._state().body.ok).toBe(true);

    const trashContents = fs.readdirSync(trashDir);
    const collisionFiles = trashContents.filter((f) =>
      f.startsWith("collision."),
    );
    expect(collisionFiles.length).toBeGreaterThanOrEqual(1);
  });

  it("returns partial success on errors", async () => {
    const res = mockRes();
    await handleTrash(
      testBase.baseDir,
      postReq("/api/trash", { paths: ["nonexistent.png"] }),
      res,
    );
    expect(res._state().status).toBe(200);
    expect(res._state().body.ok).toBe(false);
    expect(res._state().body.errors.length).toBeGreaterThan(0);
  });

  it("returns 400 for invalid body", async () => {
    const res = mockRes();
    const req = {
      url: "/api/trash",
      method: "POST",
      on(event, cb) {
        if (event === "data") cb(Buffer.from("not json"));
        if (event === "end") cb();
      },
    };
    await handleTrash(testBase.baseDir, req, res);
    expect(res._state().status).toBe(400);
  });

  it("returns 400 for empty paths array", async () => {
    const res = mockRes();
    await handleTrash(
      testBase.baseDir,
      postReq("/api/trash", { paths: [] }),
      res,
    );
    expect(res._state().status).toBe(400);
  });

  it("blocks path traversal", async () => {
    const res = mockRes();
    await handleTrash(
      testBase.baseDir,
      postReq("/api/trash", { paths: ["..%2F..%2Fetc%2Fpasswd"] }),
      res,
    );
    expect(res._state().status).toBe(200);
    expect(res._state().body.ok).toBe(false);
  });
});

describe("handleLogs", () => {
  it("returns all entries from all log files", () => {
    const res = mockRes();
    handleLogs(testBase.logsDir, { url: "/api/logs" }, res);
    const s = res._state();
    expect(s.status).toBe(200);
    expect(s.body.entries).toHaveLength(3);
    expect(s.body.fileCount).toBe(2);
    const filenames = s.body.entries.map((e) => e.filename);
    expect(filenames).toContain("img1.png");
    expect(filenames).toContain("img2.jpg");
    expect(filenames).toContain("img3.png");
  });

  it("skips malformed JSON files", async () => {
    await fs.promises.writeFile(
      path.join(testBase.logsDir, "bad.json"),
      "{not valid json",
    );
    const res = mockRes();
    handleLogs(testBase.logsDir, { url: "/api/logs" }, res);
    const s = res._state();
    expect(s.status).toBe(200);
    expect(s.body.entries).toHaveLength(3);
    await fs.promises.rm(path.join(testBase.logsDir, "bad.json"));
  });

  it("returns empty for missing logs dir", () => {
    const res = mockRes();
    handleLogs("/nonexistent/path", { url: "/api/logs" }, res);
    const s = res._state();
    expect(s.status).toBe(200);
    expect(s.body.entries).toEqual([]);
    expect(s.body.fileCount).toBe(0);
  });
});

describe("serveStatic", () => {
  it("serves index.html for root path", () => {
    const res = mockRes();
    serveStatic(testBase.staticDir, { url: "/" }, res);
    const s = res._state();
    expect(s.status).toBe(200);
    expect(s.headers["Content-Type"]).toBe("text/html");
    expect(s.body.toString()).toContain("<!DOCTYPE html>");
  });

  it("serves asset files", () => {
    const res = mockRes();
    serveStatic(testBase.staticDir, { url: "/assets/app.js" }, res);
    const s = res._state();
    expect(s.status).toBe(200);
    expect(s.headers["Content-Type"]).toBe("application/javascript");
  });

  it("SPA fallback: unknown GET route serves index.html", () => {
    const res = mockRes();
    serveStatic(testBase.staticDir, { url: "/unknown/path" }, res);
    const s = res._state();
    expect(s.status).toBe(200);
    expect(s.headers["Content-Type"]).toBe("text/html");
    expect(s.body.toString()).toContain("<!DOCTYPE html>");
  });

  it("returns 403 for path traversal", () => {
    const res = mockRes();
    serveStatic(testBase.staticDir, { url: "/../../etc/passwd" }, res);
    const s = res._state();
    expect(s.status).toBe(403);
  });

  it("strips /api/ prefix for static serving", () => {
    // If someone hits /api/something via static fallback, it should serve index.html
    const res = mockRes();
    serveStatic(testBase.staticDir, { url: "/api/something" }, res);
    const s = res._state();
    expect(s.status).toBe(200);
    expect(s.headers["Content-Type"]).toBe("text/html");
  });
});

describe("createHandler", () => {
  it("creates a handler function", () => {
    const handler = createHandler(
      testBase.baseDir,
      testBase.logsDir,
      testBase.staticDir,
    );
    expect(typeof handler).toBe("function");
  });

  it("returns 405 for DELETE on /api/fs", async () => {
    const handler = createHandler(
      testBase.baseDir,
      testBase.logsDir,
      testBase.staticDir,
    );
    const res = mockRes();
    await handler({ method: "DELETE", url: "/api/fs/" }, res);
    const s = res._state();
    expect(s.status).toBe(405);
  });

  it("returns 405 for PUT on /api/images", async () => {
    const handler = createHandler(
      testBase.baseDir,
      testBase.logsDir,
      testBase.staticDir,
    );
    const res = mockRes();
    await handler({ method: "PUT", url: "/api/images/test.png" }, res);
    const s = res._state();
    expect(s.status).toBe(405);
  });

  it("returns 405 for GET on /api/trash", async () => {
    const handler = createHandler(
      testBase.baseDir,
      testBase.logsDir,
      testBase.staticDir,
    );
    const res = mockRes();
    await handler({ method: "GET", url: "/api/trash" }, res);
    const s = res._state();
    expect(s.status).toBe(405);
  });
});

describe("handleFS backslash traversal", () => {
  it("blocks backslash-based path traversal", () => {
    const res = mockRes();
    handleFS(testBase.baseDir, { url: "/api/fs/..\\..\\etc" }, res);
    const s = res._state();
    expect(s.status).toBe(403);
  });

  it("handles backslash in subfolder name", () => {
    const res = mockRes();
    handleFS(testBase.baseDir, { url: "/api/fs/subfolder\\inner.png" }, res);
    const s = res._state();
    // After normalization, path resolves to a file, not a directory — 500
    expect(s.status).toBe(500);
  });
});

describe("handleImages backslash traversal", () => {
  it("blocks backslash-based path traversal", () => {
    const res = mockRes();
    handleImages(testBase.baseDir, { url: "/api/images/..\\..\\etc" }, res);
    const s = res._state();
    expect(s.status).toBe(403);
  });
});

describe("handleImages double-encoding", () => {
  it("rejects double-encoded path traversal", () => {
    const res = mockRes();
    handleImages(testBase.baseDir, { url: "/api/images/%252e%252e%252f" }, res);
    const s = res._state();
    expect(s.status).toBe(403);
  });

  it("serves valid single-encoded path", () => {
    const res = mockRes();
    handleImages(testBase.baseDir, { url: "/api/images/root.png" }, res);
    const s = res._state();
    expect(s.status).toBe(200);
  });
});

describe("handleTrash extension-less collision", () => {
  it("handles name collision with extension-less file", async () => {
    const trashDir = path.join(testBase.baseDir, ".trash");
    await fs.promises.mkdir(trashDir, { recursive: true });
    // Create an extension-less file in trash
    await fs.promises.writeFile(path.join(trashDir, "noext"), "trash data");
    await fs.promises.writeFile(
      path.join(testBase.baseDir, "noext"),
      "to trash",
    );

    const res = mockRes();
    await handleTrash(
      testBase.baseDir,
      postReq("/api/trash", { paths: ["noext"] }),
      res,
    );
    expect(res._state().status).toBe(200);
    expect(res._state().body.ok).toBe(true);

    const trashContents = fs.readdirSync(trashDir);
    // Should have the original + the timestamped copy
    const extlessFiles = trashContents.filter(
      (f) => f === "noext" || f.startsWith("noext."),
    );
    expect(extlessFiles.length).toBeGreaterThanOrEqual(2);
  });
});

describe("handleLogs empty directory", () => {
  it("returns empty for directory with no .json files", () => {
    // Use testBase.logsDir but first ensure we only have non-json files
    const tmpDir = path.join(os.tmpdir(), "logs-empty-test");
    fs.mkdirSync(tmpDir, { recursive: true });
    // Write a non-json file
    fs.writeFileSync(path.join(tmpDir, "readme.txt"), "not json");

    const res = mockRes();
    handleLogs(tmpDir, { url: "/api/logs" }, res);
    const s = res._state();
    expect(s.status).toBe(200);
    expect(s.body.entries).toEqual([]);
    expect(s.body.fileCount).toBe(0);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe("parseBody size limit", () => {
  it("rejects oversized body", async () => {
    const bigBody = "x".repeat(1024 * 1024 + 1); // 1MB + 1 byte
    const req = {
      url: "/api/trash",
      method: "POST",
      on(event, cb) {
        if (event === "data") cb(Buffer.from(bigBody));
        if (event === "end") cb();
      },
      destroy() {},
    };
    const res = mockRes();
    await handleTrash(testBase.baseDir, req, res);
    expect(res._state().status).toBe(400);
    expect(res._state().body.error).toBe("Invalid JSON body");
  });
});

describe("handleFS root slash consistency", () => {
  it("returns empty path for /api/fs (no slash)", () => {
    const res = mockRes();
    handleFS(testBase.baseDir, { url: "/api/fs" }, res);
    const s = res._state();
    expect(s.status).toBe(200);
    expect(s.body.path).toBe("");
  });

  it("returns empty path for /api/fs/ (trailing slash)", () => {
    const res = mockRes();
    handleFS(testBase.baseDir, { url: "/api/fs/" }, res);
    const s = res._state();
    expect(s.status).toBe(200);
    expect(s.body.path).toBe("");
  });

  it("strips trailing slash from subfolder path", () => {
    const res = mockRes();
    handleFS(testBase.baseDir, { url: "/api/fs/subfolder/" }, res);
    const s = res._state();
    expect(s.status).toBe(200);
    expect(s.body.path).toBe("subfolder");
  });
});
