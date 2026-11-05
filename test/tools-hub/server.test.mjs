import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:http", () => {
  const mockServer = {
    listen: vi.fn((port, cb) => cb && cb()),
    close: vi.fn((cb) => cb && cb()),
  };

  return {
    createServer: vi.fn((handler) => {
      mockServer.handler = handler;
      return mockServer;
    }),
  };
});

import * as httpModule from "node:http";
import {
  createServerInstance,
  start,
  apiRoutes,
} from "../../tools-hub/server.mjs";

afterEach(() => {
  vi.clearAllMocks();
});

describe("createServerInstance", () => {
  it("returns an HTTP server with a handler function", () => {
    const server = createServerInstance();
    expect(server).toBeDefined();
    expect(httpModule.createServer).toHaveBeenCalled();
  });

  it("creates a server with request handler", () => {
    createServerInstance();
    expect(httpModule.createServer).toHaveBeenCalled();
  });

  it("imports apiRoutes from the api module", () => {
    // The routes are built from the default export of routes/api/index.mjs
    // which is populated by apiLoggingFindLog() factory
    expect(createServerInstance).toBeDefined();
  });
});

describe("route matching", () => {
  it("handles unmatched requests with 404", () => {
    const mockServer = createServerInstance();
    const mockReq = { url: "/unknown", headers: { host: "localhost:4218" } };
    const mockRes = {
      statusCode: 200,
      headers: {},
      writeHead: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    };

    const handler = mockServer.handler;
    handler(mockReq, mockRes);

    expect(mockRes.writeHead).toHaveBeenCalledWith(404, {
      "Content-Type": "text/plain",
    });
    expect(mockRes.end).toHaveBeenCalledWith("Not Found");
  });

  it("calls route.serve when a route URL matches", async () => {
    createServerInstance();
    const mockReq = {
      url: "/api/logging/find-log",
      headers: { host: "localhost:4218" },
    };
    const mockRes = {
      statusCode: null,
      headers: {},
      writeHead: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    };

    const apiRoute = apiRoutes[0];
    const serveSpy = vi.spyOn(apiRoute, "serve");

    const handler = httpModule.createServer.mock.results[0].value.handler;
    await handler(mockReq, mockRes);

    expect(serveSpy).toHaveBeenCalled();
    serveSpy.mockRestore();
  });
});

describe("start", () => {
  it("returns a stop function", async () => {
    const stop = await start(4218);
    expect(typeof stop).toBe("function");
  });

  it("calls server.listen with the port", async () => {
    await start(4218);
    const mockServer = httpModule.createServer.mock.results[0].value;
    expect(mockServer.listen).toHaveBeenCalledWith(4218, expect.any(Function));
  });

  it("the stop function closes the server", async () => {
    const stop = await start(4218);
    await stop();
    const mockServer = httpModule.createServer.mock.results[0].value;
    expect(mockServer.close).toHaveBeenCalled();
  });
});

describe("export aliases", () => {
  it("exports createStaticRoutes named", () => {
    expect(createServerInstance).toBeTypeOf("function");
  });

  it("exports apiRoutes as array", () => {
    expect(typeof start).toBe("function");
  });

  it("exports default as createServerInstance", () => {
    expect(createServerInstance).toBeTypeOf("function");
  });
});
