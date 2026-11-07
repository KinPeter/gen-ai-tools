import { afterEach, describe, expect, it, vi } from "vitest";

import { mockRes } from "../support/mock-response.mjs";
import {
  mockMongoDriver,
  mongoMock,
  recordEventsInto,
  resetMongoMock,
} from "../support/mock-mongodb.mjs";

/*
 * Mirrors tools-hub/server.mjs.
 *
 * node:http is mocked so no socket is ever opened, and the mongodb driver is
 * the shared mock from test/support/mock-mongodb.mjs, so the real
 * utils/db.mjs lifecycle runs against a fake client. Driver events are routed
 * into the same `lifecycle` array as the http events so ordering such as
 * "connect -> ping -> listen" is assertable.
 */

// Records the order of side effects (db connect/ping/close, http listen/close)
// so the start/stop lifecycle can be asserted as a sequence.
const lifecycle = [];
recordEventsInto(lifecycle);

vi.mock("node:http", () => {
  const mockServer = {
    listen: vi.fn((port, cb) => {
      lifecycle.push("listen");
      cb && cb();
    }),
    close: vi.fn((cb) => {
      lifecycle.push("http-close");
      cb && cb();
    }),
  };

  return {
    createServer: vi.fn((handler) => {
      mockServer.handler = handler;
      return mockServer;
    }),
  };
});

vi.mock("mongodb", () => mockMongoDriver());

import * as httpModule from "node:http";
import { closeDb } from "../../tools-hub/utils/index.mjs";
import {
  createServerInstance,
  createStaticRoutes,
  start,
  apiRoutes,
} from "../../tools-hub/server.mjs";

const MONGODB_URI = "mongodb://mock-host:27018";

afterEach(async () => {
  // Leave the shared connection closed for the next test.
  const silenced = vi.spyOn(console, "log").mockImplementation(() => {});
  await closeDb();
  silenced.mockRestore();
  lifecycle.length = 0;
  resetMongoMock();
  vi.unstubAllEnvs();
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
    // The routes come from the default export of api/index.mjs, which now
    // registers the find-log route plus the dist-browser routes.
    expect(Array.isArray(apiRoutes)).toBe(true);

    const hasDistBrowserRoute = apiRoutes.some((route) =>
      route.testUrl("/api/dist-browser/fs"),
    );
    expect(hasDistBrowserRoute).toBe(true);
  });
});

describe("route matching", () => {
  it("handles unmatched requests with 404", () => {
    const mockServer = createServerInstance();
    const mockReq = { url: "/unknown", headers: { host: "localhost:4218" } };
    const res = mockRes();

    const handler = mockServer.handler;
    handler(mockReq, res);

    const state = res._state();
    expect(state.status).toBe(404);
    expect(state.headers).toEqual({ "Content-Type": "text/plain" });
    expect(res.bodyBytes().toString("utf8")).toBe("Not Found");
  });

  it("dispatches a dist-browser URL to its registered api route", () => {
    const server = createServerInstance();
    const distBrowserRoute = apiRoutes.find((route) =>
      route.testUrl("/api/dist-browser/fs"),
    );
    expect(distBrowserRoute).toBeDefined();

    const serveSpy = vi.spyOn(distBrowserRoute, "serve");
    server.handler(
      { url: "/api/dist-browser/fs", headers: { host: "localhost:4218" } },
      mockRes(),
    );

    expect(serveSpy).toHaveBeenCalled();
    serveSpy.mockRestore();
  });

  it("calls route.serve when a route URL matches", async () => {
    createServerInstance();
    const mockReq = {
      url: "/api/logging/find-log",
      headers: { host: "localhost:4218" },
    };

    const apiRoute = apiRoutes[0];
    const serveSpy = vi.spyOn(apiRoute, "serve");

    const handler = httpModule.createServer.mock.results[0].value.handler;
    await handler(mockReq, mockRes());

    expect(serveSpy).toHaveBeenCalled();
    serveSpy.mockRestore();
  });
});

describe("start", () => {
  it("returns a stop function", async () => {
    vi.stubEnv("MONGODB_URI", MONGODB_URI);
    vi.spyOn(console, "log").mockImplementation(() => {});

    const stop = await start(4218);

    expect(typeof stop).toBe("function");
  });

  it("calls server.listen with the port", async () => {
    vi.stubEnv("MONGODB_URI", MONGODB_URI);
    vi.spyOn(console, "log").mockImplementation(() => {});

    await start(4218);

    const mockServer = httpModule.createServer.mock.results[0].value;
    expect(mockServer.listen).toHaveBeenCalledWith(4218, expect.any(Function));
  });

  it("the stop function closes the server", async () => {
    vi.stubEnv("MONGODB_URI", MONGODB_URI);
    vi.spyOn(console, "log").mockImplementation(() => {});

    const stop = await start(4218);
    await stop();

    const mockServer = httpModule.createServer.mock.results[0].value;
    expect(mockServer.close).toHaveBeenCalled();
  });

  it("opens the shared database connection before listening", async () => {
    vi.stubEnv("MONGODB_URI", MONGODB_URI);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await start(4218);

    // Connecting is only half the handshake: the connection is pinged before
    // the server listens.
    expect(lifecycle).toEqual(["db-connect", "db-ping", "listen"]);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith("tools-hub listening on port 4218");
  });

  it("warns and keeps listening when the database cannot be opened", async () => {
    vi.stubEnv("MONGODB_URI", MONGODB_URI);
    mongoMock.connectFailure = new Error("ECONNREFUSED");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const stop = await start(4218);

    expect(typeof stop).toBe("function");
    // The failed candidate is closed by openDb, and the server still listens.
    expect(lifecycle).toEqual(["db-connect", "db-close", "listen"]);
    expect(warnSpy).toHaveBeenCalledWith(
      "tools-hub: MongoDB unavailable (ECONNREFUSED) — " +
        "database-backed API routes will return 503",
    );
  });

  it("warns and keeps listening when the connection ping fails", async () => {
    vi.stubEnv("MONGODB_URI", MONGODB_URI);
    mongoMock.pingFailure = new Error("no server selected");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const stop = await start(4218);

    expect(typeof stop).toBe("function");
    expect(lifecycle).toEqual(["db-connect", "db-ping", "db-close", "listen"]);
    expect(warnSpy).toHaveBeenCalledWith(
      "tools-hub: MongoDB unavailable (no server selected) — " +
        "database-backed API routes will return 503",
    );
  });

  it("opens no client at all when MONGODB_URI is missing", async () => {
    vi.stubEnv("MONGODB_URI", undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await start(4218);

    expect(lifecycle).toEqual(["listen"]);
    expect(warnSpy).toHaveBeenCalledWith(
      "tools-hub: MongoDB unavailable (Missing MONGODB_URI environment " +
        "variable. Set it to connect to MongoDB.) — " +
        "database-backed API routes will return 503",
    );
  });

  it("stop closes the HTTP server and then the database connection", async () => {
    vi.stubEnv("MONGODB_URI", MONGODB_URI);
    const stop = await start(4218);
    lifecycle.length = 0;

    await stop();

    expect(lifecycle).toEqual(["http-close", "db-close"]);
  });

  it("stop does not close a connection that was never opened", async () => {
    vi.stubEnv("MONGODB_URI", MONGODB_URI);
    mongoMock.connectFailure = new Error("no server selected");
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const stop = await start(4218);
    lifecycle.length = 0;

    await stop();

    expect(lifecycle).toEqual(["http-close"]);
  });
});

describe("export aliases", () => {
  it("exports createStaticRoutes named", () => {
    expect(createStaticRoutes).toBeTypeOf("function");
  });

  it("exports apiRoutes as array", () => {
    expect(Array.isArray(apiRoutes)).toBe(true);
  });

  it("exports default as createServerInstance", () => {
    expect(createServerInstance).toBeTypeOf("function");
  });
});
