import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("tools-hub/routes/api/logging/find-log.mjs", () => ({
  default: vi.fn(() => ({
    testUrl: vi.fn(
      (url) =>
        url === "/api/logging/find-log" ||
        url.startsWith("/api/logging/find-log/"),
    ),
    serve: vi.fn(),
  })),
}));

import apiRoutes from "../../../../tools-hub/routes/api/index.mjs";

afterEach(() => {
  vi.clearAllMocks();
});

describe("API route registry", () => {
  it("exports a default array", () => {
    expect(Array.isArray(apiRoutes)).toBe(true);
  });

  it("contains the find-log route", () => {
    expect(apiRoutes.length).toBeGreaterThan(0);
    const findLogRoute = apiRoutes[0];
    expect(typeof findLogRoute.testUrl).toBe("function");
    expect(typeof findLogRoute.serve).toBe("function");
  });

  it("creates route objects with testUrl and serve", () => {
    for (const route of apiRoutes) {
      expect(typeof route.testUrl).toBe("function");
      expect(typeof route.serve).toBe("function");
    }
  });

  it("routes can be called without arguments", () => {
    for (const route of apiRoutes) {
      expect(() => route.testUrl("/api/logging/find-log")).not.toThrow();
    }
  });
});
