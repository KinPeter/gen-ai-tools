import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal();
  // Only readFileSync is stubbed; the rest of fs stays real.
  return { ...actual, readFileSync: vi.fn() };
});

vi.mock("node:url", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fileURLToPath: vi.fn(() => "/tools-hub/static/assets/index.mjs"),
  };
});

vi.mock("node:path", async (importOriginal) => {
  const actual = await importOriginal();
  const overrides = {
    dirname: (p) => p.split("/").slice(0, -1).join("/") || "/",
    resolve: (root, rel) => `${root}/${rel}`,
    extname: (filename) => {
      const dot = filename.lastIndexOf(".");
      return dot > -1 ? filename.substring(dot) : "";
    },
    basename: (p) => (p || "").split("/").pop(),
  };

  // Spread `actual` so unrelated path helpers stay available.
  const path = { ...actual, ...overrides };
  return { ...path, default: path };
});

vi.mock("../../../tools-hub/utils/index.mjs", async (importOriginal) => {
  const actual = await importOriginal();

  return { ...actual, resolveUp: () => "/repo-root" };
});

import assetsFactory from "../../../tools-hub/static/assets/index.mjs";

describe("assets", () => {
  it("is a factory function", () => {
    expect(typeof assetsFactory).toBe("function");
  });

  it("returns a route object with testUrl and serve", () => {
    const route = assetsFactory();
    expect(typeof route.testUrl).toBe("function");
    expect(typeof route.serve).toBe("function");
  });

  describe("testUrl", () => {
    it("matches /assets exactly", () => {
      const route = assetsFactory();
      expect(route.testUrl("/assets")).toBe(true);
    });

    it("matches /assets/ with trailing slash", () => {
      const route = assetsFactory();
      expect(route.testUrl("/assets/")).toBe(true);
    });

    it("matches /assets/anything", () => {
      const route = assetsFactory();
      expect(route.testUrl("/assets/favicon.ico")).toBe(true);
    });

    it("matches deep paths", () => {
      const route = assetsFactory();
      expect(route.testUrl("/assets/subdir/image.jpg")).toBe(true);
    });

    it("does not match other paths", () => {
      const route = assetsFactory();
      expect(route.testUrl("/api/logging/find-log")).toBe(false);
      expect(route.testUrl("/assetsX")).toBe(false);
      expect(route.testUrl("/static/assets")).toBe(false);
    });
  });

  describe("serve", () => {
    it("serves .ico with image/x-icon MIME type", () => {
      readFileSync.mockReturnValue(Buffer.from("ico-data"));

      const route = assetsFactory();
      const mockRes = { statusCode: null, writeHead: vi.fn(), end: vi.fn() };

      route.serve({ url: "/assets/favicon.ico" }, mockRes);

      // resolveUp is mocked to /repo-root, so the asset path is deterministic.
      expect(readFileSync).toHaveBeenCalledWith(
        "/repo-root/tools-hub/assets/favicon.ico",
      );
      expect(mockRes.writeHead).toHaveBeenCalledWith(200, {
        "Content-Type": "image/x-icon",
      });
      expect(mockRes.end).toHaveBeenCalledWith(expect.any(Buffer));
    });

    it("serves .png with image/png MIME type", () => {
      readFileSync.mockReturnValue(Buffer.from("png-data"));

      const route = assetsFactory();
      const mockRes = { statusCode: null, writeHead: vi.fn(), end: vi.fn() };

      route.serve({ url: "/assets/logo.png" }, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(200, {
        "Content-Type": "image/png",
      });
    });

    it("serves .svg with image/svg+xml MIME type", () => {
      readFileSync.mockReturnValue(Buffer.from("svg-data"));

      const route = assetsFactory();
      const mockRes = { statusCode: null, writeHead: vi.fn(), end: vi.fn() };

      route.serve({ url: "/assets/icon.svg" }, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(200, {
        "Content-Type": "image/svg+xml",
      });
    });

    it("returns 404 for missing files (ENOENT error)", () => {
      const enoent = new Error("ENOENT");
      enoent.code = "ENOENT";
      readFileSync.mockImplementation(() => {
        throw enoent;
      });

      const route = assetsFactory();
      const mockRes = { statusCode: null, writeHead: vi.fn(), end: vi.fn() };

      route.serve({ url: "/assets/missing.jpg" }, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(404, {
        "Content-Type": "text/plain",
      });
      expect(mockRes.end).toHaveBeenCalledWith("Not Found");
    });

    it("returns 500 for read errors other than ENOENT", () => {
      const readError = new Error("EACCES");
      readError.code = "EACCES";
      readFileSync.mockImplementation(() => {
        throw readError;
      });

      const route = assetsFactory();
      const mockRes = { statusCode: null, writeHead: vi.fn(), end: vi.fn() };

      route.serve({ url: "/assets/logo.png" }, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(500, {
        "Content-Type": "text/plain",
      });
      expect(mockRes.end).toHaveBeenCalledWith("Internal Server Error");
    });

    it("returns 404 when url is /assets (no specific file)", () => {
      const route = assetsFactory();
      const mockRes = { statusCode: null, writeHead: vi.fn(), end: vi.fn() };

      route.serve({ url: "/assets" }, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(404, {
        "Content-Type": "text/plain",
      });
      expect(mockRes.end).toHaveBeenCalledWith("Not Found");
    });

    it("returns 404 when url is /assets/ with trailing slash", () => {
      const route = assetsFactory();
      const mockRes = { statusCode: null, writeHead: vi.fn(), end: vi.fn() };

      route.serve({ url: "/assets/" }, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(404, {
        "Content-Type": "text/plain",
      });
      expect(mockRes.end).toHaveBeenCalledWith("Not Found");
    });

    it("returns 404 for deep paths when readFileSync throws", () => {
      const enoent = new Error("ENOENT");
      enoent.code = "ENOENT";
      readFileSync.mockImplementation(() => {
        throw enoent;
      });

      const route = assetsFactory();
      const mockRes = { statusCode: null, writeHead: vi.fn(), end: vi.fn() };

      route.serve({ url: "/assets/sub/dir/file.json" }, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(404, {
        "Content-Type": "text/plain",
      });
      expect(mockRes.end).toHaveBeenCalledWith("Not Found");
    });

    it("serves deep paths (e.g. /assets/subdir/image.jpg)", () => {
      readFileSync.mockReturnValue(Buffer.from("deep-data"));

      const route = assetsFactory();
      const mockRes = { statusCode: null, writeHead: vi.fn(), end: vi.fn() };

      route.serve({ url: "/assets/subdir/image.jpg" }, mockRes);

      expect(readFileSync).toHaveBeenCalled();
      expect(mockRes.writeHead).toHaveBeenCalledWith(200, {
        "Content-Type": "image/jpeg",
      });
    });

    it("uses default MIME type for unknown extensions", () => {
      readFileSync.mockReturnValue(Buffer.from("data"));

      const route = assetsFactory();
      const mockRes = { statusCode: null, writeHead: vi.fn(), end: vi.fn() };

      // The mock extname returns ".xyz" which is not in MIME_TYPES
      route.serve({ url: "/assets/file.xyz" }, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(200, {
        "Content-Type": "application/octet-stream",
      });
    });
  });
});
