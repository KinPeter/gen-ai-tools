import { afterEach, describe, expect, it, vi } from "vitest";

import apiRoutes from "../../../tools-hub/api/index.mjs";

afterEach(() => {
  vi.clearAllMocks();
});

const DIST_BROWSER_PATHS = [
  "/api/dist-browser/fs",
  "/api/dist-browser/images",
  "/api/dist-browser/trash",
];

describe("API route registry", () => {
  it("exports a default array", () => {
    expect(Array.isArray(apiRoutes)).toBe(true);
  });

  it("registers the two logging routes and the three dist-browser routes", () => {
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

  it("matches each search-logs path with exactly one route, the search one", () => {
    let searchRoute = null;

    for (const url of [
      "/api/logging/search-logs",
      "/api/logging/search-logs/",
      "/api/logging/search-logs/limit=5",
      "/api/logging/search-logs?limit=5",
    ]) {
      const matchingRoutes = apiRoutes.filter((route) => route.testUrl(url));

      expect(matchingRoutes).toHaveLength(1);
      if (searchRoute === null) searchRoute = matchingRoutes[0];
      // One single route answers every spelling of the path, so a registry
      // that registered a different route per spelling fails here. Asking the
      // matched route whether it matches the URL it was matched on would not:
      // `matchingRoutes` is exactly the routes that already answered true.
      expect(matchingRoutes[0]).toBe(searchRoute);
      // And it is the search endpoint, not the sibling that shares the
      // /api/logging/ prefix.
      expect(matchingRoutes[0].testUrl("/api/logging/find-log")).toBe(false);
      expect(matchingRoutes[0].testUrl("/api/dist-browser/fs")).toBe(false);
    }
  });

  it("no route answers a near-miss of the search-logs path", () => {
    for (const url of [
      "/api/logging/search-logsx",
      "/api/logging/search-logs-search",
      "/api/logging/searchlog",
      "/api/search-logs",
    ]) {
      expect(apiRoutes.filter((route) => route.testUrl(url))).toHaveLength(0);
    }
  });

  it("no route answers the removed bulk logs endpoint", () => {
    for (const url of [
      "/api/dist-browser/logs",
      "/api/dist-browser/logs/",
      "/api/dist-browser/logs/run1.json",
    ]) {
      const matchingRoutes = apiRoutes.filter((route) => route.testUrl(url));
      expect(matchingRoutes).toHaveLength(0);
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
