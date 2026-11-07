import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  afterEach,
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import apiDistBrowser from "../../../tools-hub/api/dist-browser/index.mjs";
import {
  handleFS,
  handleImages,
  handleTrash,
} from "../../../tools-hub/api/dist-browser/handlers/index.mjs";
import {
  getContentType,
  normalizePathSegment,
  parseBody,
  resolveBase,
  sendError,
  sendJSON,
} from "../../../tools-hub/utils/index.mjs";
import { mockReq, mockRes } from "../../support/mock-response.mjs";

let testBase;
let routes;

/** Fixture image written into the temp fixtures, used to verify streamed bytes. */
const PNG_DATA = fs.readFileSync(
  new URL("../../../test/fixtures/images/tiny.png", import.meta.url),
);

beforeAll(async () => {
  testBase = {
    baseDir: await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "dist-browser-test-"),
    ),
  };

  await fs.promises.mkdir(path.join(testBase.baseDir, "images"), {
    recursive: true,
  });
  await fs.promises.mkdir(path.join(testBase.baseDir, "subfolder"), {
    recursive: true,
  });

  // Write test images (use PNG since it's in IMAGE_EXTENSIONS)
  await fs.promises.writeFile(
    path.join(testBase.baseDir, "root.png"),
    PNG_DATA,
  );
  await fs.promises.writeFile(
    path.join(testBase.baseDir, "test.jpg"),
    PNG_DATA,
  );
  await fs.promises.writeFile(
    path.join(testBase.baseDir, "images", "nested.png"),
    PNG_DATA,
  );
});

beforeEach(() => {
  routes = apiDistBrowser({ baseDir: testBase.baseDir });
});

afterEach(async () => {
  // Clean up any test artifacts
  if (testBase) {
    const trashDir = path.join(testBase.baseDir, ".trash");
    if (fs.existsSync(trashDir)) {
      await fs.promises.rm(trashDir, { recursive: true, force: true });
    }
  }
});

afterAll(async () => {
  if (testBase) {
    await fs.promises.rm(testBase.baseDir, { recursive: true, force: true });
  }
});

// --- Tests ---

describe("apiDistBrowser factory", () => {
  it("returns an array of 3 route objects", () => {
    const routes = apiDistBrowser();
    expect(Array.isArray(routes)).toBe(true);
    expect(routes).toHaveLength(3);
  });

  it("each route has testUrl and serve", () => {
    const routes = apiDistBrowser();
    for (const route of routes) {
      expect(typeof route.testUrl).toBe("function");
      expect(typeof route.serve).toBe("function");
    }
  });

  it("no route answers the removed bulk logs endpoint", () => {
    for (const url of [
      "/api/dist-browser/logs",
      "/api/dist-browser/logs/",
      "/api/dist-browser/logs/run1.json",
    ]) {
      expect(routes.some((route) => route.testUrl(url))).toBe(false);
    }
  });

  it("uses the provided baseDir for the fs and images routes", async () => {
    const customBase = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "dist-browser-custom-base-"),
    );

    try {
      await fs.promises.writeFile(path.join(customBase, "marker.png"), "png");

      const customRoutes = apiDistBrowser({ baseDir: customBase });

      const listingRes = mockRes();
      customRoutes[0].serve(mockReq("/api/dist-browser/fs"), listingRes);
      expect(listingRes._state().status).toBe(200);
      expect(listingRes._state().body.entries).toEqual([
        { name: "marker.png", type: "file", ext: "png" },
      ]);

      const imageRes = mockRes();
      customRoutes[1].serve(
        mockReq("/api/dist-browser/images/marker.png"),
        imageRes,
      );
      await imageRes.waitForEnd();
      expect(imageRes._state().status).toBe(200);
      expect(imageRes.bodyBytes().toString("utf8")).toBe("png");
    } finally {
      await fs.promises.rm(customBase, { recursive: true, force: true });
    }
  });
});

describe("fs route", () => {
  const fsRoute = () => routes[0];

  describe("testUrl", () => {
    it("matches /api/dist-browser/fs exactly", () => {
      expect(fsRoute().testUrl("/api/dist-browser/fs")).toBe(true);
    });

    it("matches /api/dist-browser/fs/", () => {
      expect(fsRoute().testUrl("/api/dist-browser/fs/")).toBe(true);
    });

    it("matches /api/dist-browser/fs/subpath", () => {
      expect(fsRoute().testUrl("/api/dist-browser/fs/images")).toBe(true);
    });

    it("matches /api/dist-browser/fs/subpath/nested", () => {
      expect(fsRoute().testUrl("/api/dist-browser/fs/images/nested.png")).toBe(
        true,
      );
    });

    it("matches /api/dist-browser/fs with query params", () => {
      expect(fsRoute().testUrl("/api/dist-browser/fs?key=value")).toBe(true);
    });

    it("does not match /api/dist-browser/images", () => {
      expect(fsRoute().testUrl("/api/dist-browser/images")).toBe(false);
    });
  });

  describe("serve", () => {
    it("returns directory listing for root path", () => {
      const res = mockRes();
      fsRoute().serve(mockReq("/api/dist-browser/fs"), res);
      const s = res._state();
      expect(s.status).toBe(200);
      expect(s.body.path).toBe("");
      expect(Array.isArray(s.body.entries)).toBe(true);
      const names = s.body.entries.map((e) => e.name);
      expect(names).toContain("root.png");
    });

    it("returns 404 for missing directory", () => {
      const res = mockRes();
      fsRoute().serve(mockReq("/api/dist-browser/fs/nonexistent/"), res);
      const s = res._state();
      expect(s.status).toBe(404);
    });

    it("returns 403 for path traversal", () => {
      const res = mockRes();
      fsRoute().serve(mockReq("/api/dist-browser/fs/..%2F.."), res);
      const s = res._state();
      expect(s.status).toBe(403);
    });

    it("returns the root listing for a trailing-slash path", () => {
      const res = mockRes();
      fsRoute().serve(mockReq("/api/dist-browser/fs/"), res);
      const s = res._state();
      expect(s.status).toBe(200);
      expect(s.body.path).toBe("");
      expect(s.body.entries.map((e) => e.name)).toContain("root.png");
    });
  });
});

describe("images route", () => {
  const imagesRoute = () => routes[1];

  describe("testUrl", () => {
    it("matches /api/dist-browser/images exactly", () => {
      expect(imagesRoute().testUrl("/api/dist-browser/images")).toBe(true);
    });

    it("matches /api/dist-browser/images/", () => {
      expect(imagesRoute().testUrl("/api/dist-browser/images/")).toBe(true);
    });

    it("matches /api/dist-browser/images/filename.png", () => {
      expect(imagesRoute().testUrl("/api/dist-browser/images/root.png")).toBe(
        true,
      );
    });

    it("does not match /api/dist-browser/fs", () => {
      expect(imagesRoute().testUrl("/api/dist-browser/fs")).toBe(false);
    });
  });

  describe("serve", () => {
    it("streams the file bytes with the right status and content type", async () => {
      const res = mockRes();
      imagesRoute().serve(mockReq("/api/dist-browser/images/root.png"), res);
      await res.waitForEnd();

      const s = res._state();
      expect(s.status).toBe(200);
      expect(s.headers["Content-Type"]).toBe("image/png");
      expect(Buffer.compare(res.bodyBytes(), PNG_DATA)).toBe(0);
    });

    it("returns 404 for missing file", () => {
      const res = mockRes();
      imagesRoute().serve(mockReq("/api/dist-browser/images/missing.png"), res);
      const s = res._state();
      expect(s.status).toBe(404);
    });

    it("returns 403 for path traversal", () => {
      const res = mockRes();
      imagesRoute().serve(mockReq("/api/dist-browser/images/..%2F.."), res);
      const s = res._state();
      expect(s.status).toBe(403);
    });
  });
});

describe("trash route", () => {
  const trashRoute = () => routes[2];

  describe("testUrl", () => {
    it("matches /api/dist-browser/trash exactly", () => {
      expect(trashRoute().testUrl("/api/dist-browser/trash")).toBe(true);
    });

    it("matches /api/dist-browser/trash/", () => {
      expect(trashRoute().testUrl("/api/dist-browser/trash/")).toBe(true);
    });

    it("matches /api/dist-browser/trash/subpath", () => {
      expect(trashRoute().testUrl("/api/dist-browser/trash/something")).toBe(
        true,
      );
    });
  });

  describe("serve", () => {
    it("returns 200 with paths array", async () => {
      const res = mockRes();
      await trashRoute().serve(
        mockReq("/api/dist-browser/trash", "POST", { paths: ["root.png"] }),
        res,
      );
      const s = res._state();
      expect(s.status).toBe(200);
      expect(Array.isArray(s.body.errors)).toBe(true);
    });

    it("returns 400 for empty paths array", async () => {
      const res = mockRes();
      await trashRoute().serve(
        mockReq("/api/dist-browser/trash", "POST", { paths: [] }),
        res,
      );
      expect(res._state().status).toBe(400);
    });

    it("returns 400 for invalid JSON body", async () => {
      const res = mockRes();
      await trashRoute().serve(
        {
          url: "/api/dist-browser/trash",
          method: "POST",
          on(event, cb) {
            if (event === "data") cb(Buffer.from("not json"));
            if (event === "end") cb();
          },
        },
        res,
      );
      expect(res._state().status).toBe(400);
    });

    it("blocks path traversal", async () => {
      const res = mockRes();
      await trashRoute().serve(
        mockReq("/api/dist-browser/trash", "POST", {
          paths: ["..%2F..%2Fetc%2Fpasswd"],
        }),
        res,
      );
      expect(res._state().status).toBe(200);
      expect(res._state().body.ok).toBe(false);
    });
  });
});

// --- Handler function tests ---

describe("handler functions", () => {
  it("handleFS returns correct entries for a directory", () => {
    const res = mockRes();
    handleFS(testBase.baseDir, { url: "/api/dist-browser/fs/" }, res);
    const s = res._state();
    expect(s.status).toBe(200);
    expect(s.body.path).toBe("");
    expect(Array.isArray(s.body.entries)).toBe(true);
  });

  it("handleImages returns 404 for non-existent file", () => {
    const res = mockRes();
    handleImages(
      testBase.baseDir,
      { url: "/api/dist-browser/images/nope.png" },
      res,
    );
    expect(res._state().status).toBe(404);
  });

  it("handleImages returns 400 for no trailing slash and no path", () => {
    const res = mockRes();
    handleImages(testBase.baseDir, { url: "/api/dist-browser/images" }, res);
    expect(res._state().status).toBe(400);
    expect(res._state().body.error).toBe("Empty path");
  });

  it("handleImages returns 400 for trailing slash but no path", () => {
    const res = mockRes();
    handleImages(testBase.baseDir, { url: "/api/dist-browser/images/" }, res);
    expect(res._state().status).toBe(400);
  });

  it("handleTrash moves files to .trash/", async () => {
    await fs.promises.writeFile(
      path.join(testBase.baseDir, "trash-test.png"),
      PNG_DATA,
    );
    const res = mockRes();
    const req = mockReq("/api/dist-browser/trash", "POST", {
      paths: ["trash-test.png"],
    });
    await handleTrash(testBase.baseDir, req, res);
    expect(res._state().status).toBe(200);
    expect(res._state().body.ok).toBe(true);
    expect(
      fs.existsSync(path.join(testBase.baseDir, ".trash", "trash-test.png")),
    ).toBe(true);
    await fs.promises.rm(
      path.join(testBase.baseDir, ".trash", "trash-test.png"),
    );
  });

  it("handleTrash reports errors when rename fails", async () => {
    // Create a file in baseDir
    const testFile = path.join(testBase.baseDir, "trash-error.png");
    await fs.promises.writeFile(testFile, PNG_DATA);

    // Track renameSync calls using vi.spyOn
    let renameCallCount = 0;
    const renameSpy = vi.spyOn(fs, "renameSync").mockImplementation(function (
      ...args
    ) {
      renameCallCount++;
      // Throw on the last renameSync call in the second handleTrash
      if (renameCallCount === 2) {
        throw new Error("permission denied");
      }
      return renameSpy.mock.originalMethod.apply(this, args);
    });

    try {
      // First handleTrash: moves the file to trash
      await handleTrash(
        testBase.baseDir,
        mockReq("/api/dist-browser/trash", "POST", {
          paths: ["trash-error.png"],
        }),
        mockRes(),
      );

      // Write file back for second call
      await fs.promises.writeFile(testFile, PNG_DATA);

      // Second handleTrash: triggers rename error path
      const res = mockRes();
      await handleTrash(
        testBase.baseDir,
        mockReq("/api/dist-browser/trash", "POST", {
          paths: ["trash-error.png"],
        }),
        res,
      );
      const s = res._state();
      expect(s.status).toBe(200);
      expect(s.body.ok).toBe(false);
      expect(s.body.errors[0].error).toBe("permission denied");
    } finally {
      renameSpy.mockRestore();
    }
  });
});

describe("normalizePathSegment", () => {
  it("decodes URL-encoded characters", () => {
    // %2F decodes to /, %2E decodes to .
    // %2F%2E%2E%2Ftest → /../test
    expect(normalizePathSegment("%2F%2E%2E%2Ftest")).toBe("/../test");
  });

  it("converts backslashes to forward slashes", () => {
    expect(normalizePathSegment("sub\\folder")).toBe("sub/folder");
  });

  it("handles empty strings", () => {
    expect(normalizePathSegment("")).toBe("");
  });

  it("falls back to the raw segment for malformed percent encoding", () => {
    // decodeURIComponent throws URIError on a truncated escape, so the
    // catch branch returns the segment with backslashes still normalised.
    expect(normalizePathSegment("%C2")).toBe("%C2");
    expect(normalizePathSegment("%C2\\A")).toBe("%C2/A");
  });
});

describe("resolveBase", () => {
  it("returns safe=true for paths within base", () => {
    const result = resolveBase("/base/dir", "subfolder");
    expect(result.safe).toBe(true);
  });

  it("returns safe=false for paths that escape base", () => {
    const result = resolveBase("/base/dir", "../other");
    expect(result.safe).toBe(false);
  });

  it("handles trailing slashes", () => {
    const result = resolveBase("/base/dir", "subfolder/");
    expect(result.safe).toBe(true);
  });

  it("handles empty relative path", () => {
    const result = resolveBase("/base/dir", "");
    expect(result.safe).toBe(true);
  });
});

describe("getContentType", () => {
  it("returns image/jpeg for .jpg", () => {
    expect(getContentType("photo.jpg")).toBe("image/jpeg");
  });

  it("returns image/jpeg for .jpeg", () => {
    expect(getContentType("photo.jpeg")).toBe("image/jpeg");
  });

  it("returns image/png for .png", () => {
    expect(getContentType("photo.png")).toBe("image/png");
  });

  it("returns application/octet-stream for unknown", () => {
    expect(getContentType("file.xyz")).toBe("application/octet-stream");
  });

  it("returns text/html for .html files", () => {
    expect(getContentType("page.html")).toBe("text/html; charset=utf-8");
  });

  it("returns text/css for .css files", () => {
    expect(getContentType("style.css")).toBe("text/css; charset=utf-8");
  });

  it("returns application/json for .json files", () => {
    expect(getContentType("data.json")).toBe("application/json; charset=utf-8");
  });

  it("returns image/x-icon for .ico files", () => {
    expect(getContentType("favicon.ico")).toBe("image/x-icon");
  });

  it("returns application/javascript for .js files", () => {
    expect(getContentType("app.js")).toBe(
      "application/javascript; charset=utf-8",
    );
  });
});

describe("route isolation (stateless routes)", () => {
  it("creates independent route sets with different configs", async () => {
    const baseDirA = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "dist-browser-base-a-"),
    );
    const baseDirB = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "dist-browser-base-b-"),
    );

    try {
      await fs.promises.writeFile(path.join(baseDirA, "a.png"), "a");
      await fs.promises.writeFile(path.join(baseDirB, "b.png"), "b");

      const routesA = apiDistBrowser({ baseDir: baseDirA });
      const routesB = apiDistBrowser({ baseDir: baseDirB });

      // Each set should have 3 routes
      expect(routesA).toHaveLength(3);
      expect(routesB).toHaveLength(3);

      // Each set reads from its own baseDir, not the other one.
      const resA = mockRes();
      routesA[0].serve(mockReq("/api/dist-browser/fs/"), resA);
      const resB = mockRes();
      routesB[0].serve(mockReq("/api/dist-browser/fs/"), resB);

      expect(resA._state().body.entries.map((e) => e.name)).toEqual(["a.png"]);
      expect(resB._state().body.entries.map((e) => e.name)).toEqual(["b.png"]);
    } finally {
      await fs.promises.rm(baseDirA, { recursive: true, force: true });
      await fs.promises.rm(baseDirB, { recursive: true, force: true });
    }
  });

  it("does not interfere with each other when called together", () => {
    const routes = apiDistBrowser({ baseDir: testBase.baseDir });

    const fsRoute = routes[0];
    const imagesRoute = routes[1];
    const trashRoute = routes[2];

    // Should not overlap
    expect(fsRoute.testUrl("/api/dist-browser/fs")).toBe(true);
    expect(imagesRoute.testUrl("/api/dist-browser/fs")).toBe(false);
    expect(trashRoute.testUrl("/api/dist-browser/fs")).toBe(false);

    expect(imagesRoute.testUrl("/api/dist-browser/images")).toBe(true);
    expect(fsRoute.testUrl("/api/dist-browser/images")).toBe(false);
    expect(trashRoute.testUrl("/api/dist-browser/images")).toBe(false);

    expect(trashRoute.testUrl("/api/dist-browser/trash")).toBe(true);
    expect(fsRoute.testUrl("/api/dist-browser/trash")).toBe(false);
    expect(imagesRoute.testUrl("/api/dist-browser/trash")).toBe(false);
  });
});

describe("sendJSON and sendError", () => {
  it("sendJSON writes correct status and body", () => {
    const res = mockRes();
    sendJSON(res, 200, { key: "value" });
    const s = res._state();
    expect(s.status).toBe(200);
    expect(s.body).toEqual({ key: "value" });
  });

  it("sendError writes correct status and error message", () => {
    const res = mockRes();
    sendError(res, 404, "Not found");
    const s = res._state();
    expect(s.status).toBe(404);
    expect(s.body.error).toBe("Not found");
  });
});

describe("parseBody", () => {
  it("parses valid JSON", async () => {
    const req = {
      on(event, cb) {
        if (event === "data") cb(Buffer.from(JSON.stringify({ paths: ["a"] })));
        if (event === "end") cb();
      },
    };
    const body = await parseBody(req);
    expect(body).toBe(JSON.stringify({ paths: ["a"] }));
  });

  it("rejects oversized body", async () => {
    const bigBody = "x".repeat(1024 * 1024 + 1);
    const req = {
      on(event, cb) {
        if (event === "data") cb(Buffer.from(bigBody));
        if (event === "end") cb();
      },
      destroy() {},
    };
    await expect(parseBody(req)).rejects.toThrow("Request body too large");
  });
});

// --- Additional coverage for uncovered handler lines ---

describe("handler coverage gaps", () => {
  it("handleFS sort exercises localeCompare branch (same-type entries)", () => {
    const res = mockRes();
    handleFS(testBase.baseDir, { url: "/api/dist-browser/fs/" }, res);
    const s = res._state();
    // All file entries are sorted by name via localeCompare
    // Verify files are in sorted order (root.png before test.jpg)
    const fileEntries = s.body.entries.filter((e) => e.type === "file");
    const names = fileEntries.map((e) => e.name);
    for (let i = 1; i < names.length; i++) {
      expect(names[i - 1] <= names[i]).toBe(true);
    }
  });

  it("handleTrash destSafe guard accepts a plain basename", async () => {
    // handle-trash.mjs validates the destination with resolveBase(trashDir,
    // name), where name is path.basename(resolved) and can therefore never
    // contain a separator. The !destSafe branch (handle-trash.mjs:68-70) is
    // unreachable, so this pins the reachable behaviour: the guard never
    // blocks a legitimate move.
    const testFile = path.join(testBase.baseDir, "trash-dstsafe.png");
    await fs.promises.writeFile(testFile, PNG_DATA);

    const trashDir = path.join(testBase.baseDir, ".trash");
    await fs.promises.mkdir(trashDir, { recursive: true });
    await fs.promises.writeFile(path.join(trashDir, "existing.png"), "trash");

    const res = mockRes();
    await handleTrash(
      testBase.baseDir,
      mockReq("/api/dist-browser/trash", "POST", {
        paths: ["trash-dstsafe.png"],
      }),
      res,
    );

    expect(res._state().status).toBe(200);
    expect(res._state().body.ok).toBe(true);
    expect(res._state().body.errors).toEqual([]);
    expect(fs.existsSync(path.join(trashDir, "trash-dstsafe.png"))).toBe(true);
    expect(fs.existsSync(testFile)).toBe(false);
  });
});
