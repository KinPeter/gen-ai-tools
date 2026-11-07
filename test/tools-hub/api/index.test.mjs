import { afterEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "../../../tools-hub/api/index.mjs";

afterEach(() => {
  vi.clearAllMocks();
});

const DIST_BROWSER_PATHS = [
  "/api/dist-browser/fs",
  "/api/dist-browser/images",
  "/api/dist-browser/trash",
  "/api/dist-browser/logs",
];

describe("API route registry", () => {
  it("exports a default array", () => {
    expect(Array.isArray(apiRoutes)).toBe(true);
  });

  it("registers the find-log route and the four dist-browser routes", () => {
    expect(apiRoutes).toHaveLength(5);
  });

  it("contains the find-log route with its real URL matching", () => {
    const findLogRoute = apiRoutes[0];
    expect(typeof findLogRoute.testUrl).toBe("function");
    expect(typeof findLogRoute.serve).toBe("function");
    expect(findLogRoute.testUrl("/api/logging/find-log")).toBe(true);
    expect(findLogRoute.testUrl("/api/logging/find-log/")).toBe(true);
    expect(findLogRoute.testUrl("/api/logging/find-log?filename=x")).toBe(true);
    expect(findLogRoute.testUrl("/api/dist-browser/fs")).toBe(false);
  });

  it("matches each dist-browser path with exactly one route", () => {
    for (const url of DIST_BROWSER_PATHS) {
      const matchingRoutes = apiRoutes.filter((route) => route.testUrl(url));
      expect(matchingRoutes).toHaveLength(1);
      expect(typeof matchingRoutes[0].serve).toBe("function");
    }
  });

  it("creates route objects with testUrl and serve", () => {
    for (const route of apiRoutes) {
      expect(typeof route.testUrl).toBe("function");
      expect(typeof route.serve).toBe("function");
    }
  });

  it("routes accept a URL string without throwing", () => {
    for (const route of apiRoutes) {
      expect(() => route.testUrl("/api/logging/find-log")).not.toThrow();
    }
  });
});
