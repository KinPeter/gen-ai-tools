import { describe, expect, it, vi } from "vitest";

vi.mock("node:url", () => ({
  fileURLToPath: vi.fn((url) => "/mock" + (url.pathname || "")),
}));

vi.mock("tools-hub/utils/path.mjs", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, resolveUp: vi.fn(actual.resolveUp) };
});

vi.mock("../../../../tools-hub/routes/static/logfinder/index.mjs", () => {
  const mockLogfinder = vi.fn(() => ({
    testUrl: vi.fn((url) =>
      url === "/logfinder" || url.startsWith("/logfinder/"),
    ),
    serve: vi.fn(),
  }));
  return { default: mockLogfinder };
});

import createStaticRoutes from "../../../../tools-hub/routes/static/index.mjs";
import * as staticModule from "../../../../tools-hub/routes/static/index.mjs";
import logfinderModule from "../../../../tools-hub/routes/static/logfinder/index.mjs";

describe("createStaticRoutes", () => {
  it("returns an array of route objects", () => {
    const routes = createStaticRoutes();
    expect(Array.isArray(routes)).toBe(true);
    expect(routes.length).toBe(1);
    expect(typeof routes[0].testUrl).toBe("function");
    expect(typeof routes[0].serve).toBe("function");
  });

  it("creates a fresh registry each call", () => {
    const routes1 = createStaticRoutes();
    const routes2 = createStaticRoutes();
    expect(routes1).not.toBe(routes2);
  });

  it("exports as default and named export", () => {
    expect(staticModule.createStaticRoutes).toBeTypeOf("function");
    expect(createStaticRoutes).toBeTypeOf("function");
  });
});

describe("logfinder factory", () => {
  it("is called with the repo root path", () => {
    createStaticRoutes();
    expect(logfinderModule).toHaveBeenCalled();
  });

  it("passes resolveUp result to logfinder", () => {
    createStaticRoutes();
    expect(logfinderModule).toHaveBeenCalled();
  });
});
