import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("node:fs", () => ({ readFileSync: vi.fn() }));

vi.mock("node:url", () => ({
  fileURLToPath: vi.fn(() => "/tools-hub/routes/static/logfinder/index.mjs"),
}));

vi.mock("node:path", () => ({
  dirname: (p) => p.split("/").slice(0, -1).join("/") || "/",
  resolve: (root, rel) => `${root}/${rel}`,
}));

vi.mock("tools-hub/utils/path.mjs", () => ({ resolveUp: () => "/repo-root" }));

import logfinderFactory from "../../../../tools-hub/routes/static/logfinder/index.mjs";

describe("logfinder", () => {
  it("is a factory function", () => {
    expect(typeof logfinderFactory).toBe("function");
  });

  it("returns a route object with testUrl and serve", () => {
    const route = logfinderFactory();
    expect(typeof route.testUrl).toBe("function");
    expect(typeof route.serve).toBe("function");
  });

  describe("testUrl", () => {
    it("matches /logfinder exactly", () => {
      const route = logfinderFactory();
      expect(route.testUrl("/logfinder")).toBe(true);
    });

    it("matches /logfinder/ with trailing slash", () => {
      const route = logfinderFactory();
      expect(route.testUrl("/logfinder/")).toBe(true);
    });

    it("matches /logfinder/anything", () => {
      const route = logfinderFactory();
      expect(route.testUrl("/logfinder/something")).toBe(true);
    });

    it("does not match other paths", () => {
      const route = logfinderFactory();
      expect(route.testUrl("/api/logging/find-log")).toBe(false);
      expect(route.testUrl("/logfind")).toBe(false);
      expect(route.testUrl("/logfinderX")).toBe(false);
    });
  });

  describe("serve", () => {
    it("writes HTML with 200 status", () => {
      readFileSync.mockReturnValue("<html><body>Log Finder</body></html>");

      const route = logfinderFactory();
      const mockRes = { statusCode: null, writeHead: vi.fn(), end: vi.fn() };

      route.serve({}, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(200, {
        "Content-Type": "text/html; charset=utf-8",
      });
      expect(mockRes.end).toHaveBeenCalledWith(
        "<html><body>Log Finder</body></html>",
      );
    });

    it("calls readFileSync with the UI_PATH", () => {
      readFileSync.mockReturnValue("<html></html>");

      const route = logfinderFactory();
      route.serve({}, { writeHead: vi.fn(), end: vi.fn() });

      expect(readFileSync).toHaveBeenCalled();
    });

    it("returns 500 when readFileSync throws", () => {
      readFileSync.mockImplementation(() => {
        throw new Error("file not found");
      });

      const route = logfinderFactory();
      const mockRes = { statusCode: null, writeHead: vi.fn(), end: vi.fn() };

      route.serve({}, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(500, {
        "Content-Type": "text/plain",
      });
      expect(mockRes.end).toHaveBeenCalledWith("Internal Server Error");
    });
  });
});
