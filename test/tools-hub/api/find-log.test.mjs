import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * Mirrors tools-hub/api/logging/find-log.mjs.
 *
 * Layout deviation (pre-existing, stated here per the testing standards): this
 * route lives at tools-hub/api/logging/find-log.mjs but its test is
 * test/tools-hub/api/find-log.test.mjs rather than
 * test/tools-hub/api/logging/find-log.test.mjs.
 *
 * Isolation: the mongodb driver is the shared mock from
 * test/support/mock-mongodb.mjs, so tools-hub/utils/db.mjs runs against a fake
 * client and no test can reach a real database. Only `findLogEntry` is stubbed
 * in logging/mongodb/find-log.mjs: `normalizeFilename` is the real one, so the
 * route can never drift from the actual filename normalisation.
 */
import {
  mockMongoDriver,
  mongoClients,
  resetMongoMock,
} from "../../support/mock-mongodb.mjs";
import { mockReq, mockRes } from "../../support/mock-response.mjs";

vi.mock("mongodb", () => mockMongoDriver());

vi.mock("../../../logging/mongodb/find-log.mjs", async () => {
  const actual = await import("../../../logging/mongodb/find-log.mjs");
  return { ...actual, findLogEntry: vi.fn() };
});

import { findLogEntry } from "../../../logging/mongodb/find-log.mjs";
import { closeDb, openDb } from "../../../tools-hub/utils/index.mjs";
import apiLoggingFindLog, {
  serverFindLog,
} from "../../../tools-hub/api/logging/find-log.mjs";

const MONGODB_URI = "mongodb://mock-host:27017";
const NOT_CONNECTED_MESSAGE =
  "MongoDB is not connected: the server could not open a connection at startup.";

const SAMPLE_ENTRY = {
  _id: "507f1f77bcf86cd799439011",
  filename: "rover-euler_20261101141233",
  steps: 20,
  prompt: "test prompt",
};

/** Opens the shared connection the way the server does at startup. */
async function connectSharedDb() {
  vi.stubEnv("MONGODB_URI", MONGODB_URI);
  return openDb();
}

/** The entry the stubbed logging layer answers with, plus the call it got. */
function firstFindLogCall() {
  return findLogEntry.mock.calls[0];
}

afterEach(async () => {
  findLogEntry.mockReset();
  resetMongoMock();
  const silenced = vi.spyOn(console, "log").mockImplementation(() => {});
  await closeDb();
  silenced.mockRestore();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("apiLoggingFindLog", () => {
  it("returns a route object with testUrl and serve", () => {
    const route = apiLoggingFindLog();
    expect(typeof route.testUrl).toBe("function");
    expect(typeof route.serve).toBe("function");
  });

  describe("testUrl", () => {
    it("matches /api/logging/find-log exactly", () => {
      const route = apiLoggingFindLog();
      expect(route.testUrl("/api/logging/find-log")).toBe(true);
    });

    it("matches /api/logging/find-log/ with trailing slash", () => {
      const route = apiLoggingFindLog();
      expect(route.testUrl("/api/logging/find-log/")).toBe(true);
    });

    it("matches /api/logging/find-log?query", () => {
      const route = apiLoggingFindLog();
      expect(route.testUrl("/api/logging/find-log?filename=test.jpg")).toBe(
        true,
      );
    });

    it("matches /api/logging/find-log/anything", () => {
      const route = apiLoggingFindLog();
      expect(route.testUrl("/api/logging/find-log/something")).toBe(true);
    });

    it("does not match other API paths", () => {
      const route = apiLoggingFindLog();
      expect(route.testUrl("/api/logging/")).toBe(false);
      expect(route.testUrl("/api/logging/find-logx")).toBe(false);
      expect(route.testUrl("/api/something/else")).toBe(false);
    });
  });

  describe("serve", () => {
    it("returns 400 when filename is missing", async () => {
      const route = apiLoggingFindLog();
      const res = mockRes();

      await route.serve(mockReq("/api/logging/find-log"), res);

      const state = res._state();
      expect(res.statusCode).toBe(400);
      expect(state.status).toBe(400);
      expect(state.headers).toEqual({ "content-type": "application/json" });
      expect(state.body).toEqual({ error: "Missing filename parameter" });
      expect(findLogEntry).not.toHaveBeenCalled();
    });

    it("returns 404 when no log entry found", async () => {
      const route = apiLoggingFindLog();
      const res = mockRes();

      await connectSharedDb();
      findLogEntry.mockResolvedValue(null);

      await route.serve(
        mockReq("/api/logging/find-log?filename=test.jpg"),
        res,
      );

      const state = res._state();
      expect(state.status).toBe(404);
      expect(state.body).toEqual({ error: "No log entry found for: test.jpg" });
      expect(firstFindLogCall()[0]).toBe("test");
    });

    it("returns 200 with entry when found, using the shared collection", async () => {
      const route = apiLoggingFindLog();
      const res = mockRes();

      const client = await connectSharedDb();
      findLogEntry.mockResolvedValue(SAMPLE_ENTRY);

      await route.serve(
        mockReq("/api/logging/find-log?filename=rover.jpg"),
        res,
      );

      const state = res._state();
      expect(state.status).toBe(200);
      expect(state.body).toEqual(SAMPLE_ENTRY);
      // The handler must not close the connection the server owns.
      expect(client.close).not.toHaveBeenCalled();
    });

    it("normalises the filename before querying, keeping the original in the 404", async () => {
      const route = apiLoggingFindLog();
      const res = mockRes();

      await connectSharedDb();
      findLogEntry.mockResolvedValue(null);

      await route.serve(
        mockReq("/api/logging/find-log?filename=shots/rover.JPG"),
        res,
      );

      expect(firstFindLogCall()[0]).toBe("rover");
      expect(res._state().body).toEqual({
        error: "No log entry found for: shots/rover.JPG",
      });
    });

    it("returns 503 when the shared connection was never opened", async () => {
      const route = apiLoggingFindLog();
      const res = mockRes();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await route.serve(
        mockReq("/api/logging/find-log?filename=error.jpg"),
        res,
      );

      const state = res._state();
      expect(res.statusCode).toBe(503);
      expect(state.status).toBe(503);
      expect(state.body).toEqual({ error: NOT_CONNECTED_MESSAGE });
      expect(findLogEntry).not.toHaveBeenCalled();
      expect(mongoClients()).toHaveLength(0);
      expect(errorSpy).toHaveBeenCalledWith(
        `Error finding log entry: ${NOT_CONNECTED_MESSAGE}`,
      );
    });

    it("returns 500 when findLogEntry throws", async () => {
      const route = apiLoggingFindLog();
      const res = mockRes();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await connectSharedDb();
      findLogEntry.mockRejectedValue(new Error("database error"));

      await route.serve(
        mockReq("/api/logging/find-log?filename=error.jpg"),
        res,
      );

      const state = res._state();
      expect(res.statusCode).toBe(500);
      expect(state.status).toBe(500);
      expect(state.body).toEqual({ error: "database error" });
      expect(errorSpy).toHaveBeenCalledWith(
        "Error finding log entry: database error",
      );
    });

    it("handles filename with query string", async () => {
      const route = apiLoggingFindLog();
      const res = mockRes();

      await connectSharedDb();
      findLogEntry.mockResolvedValue(SAMPLE_ENTRY);

      await route.serve(
        mockReq("/api/logging/find-log?filename=test.jpg&extra=param"),
        res,
      );

      expect(firstFindLogCall()[0]).toBe("test");
      expect(res._state().status).toBe(200);
    });
  });

  describe("serverFindLog composition", () => {
    it("normalizes the filename and queries the image-logs collection of gen-ai", async () => {
      const client = await connectSharedDb();
      findLogEntry.mockResolvedValue(SAMPLE_ENTRY);

      const result = await serverFindLog("rover.jpg");

      expect(findLogEntry).toHaveBeenCalledTimes(1);
      const [stripped, connection] = firstFindLogCall();
      expect(stripped).toBe("rover");
      expect(connection.collection.dbName).toBe("gen-ai");
      expect(connection.collection.collectionName).toBe("image-logs");

      expect(result).toEqual(SAMPLE_ENTRY);
      // No per-request connection is opened or closed any more.
      expect(client.close).not.toHaveBeenCalled();
    });

    it("returns null without touching the database when the filename normalises to empty", async () => {
      // No connection is opened on purpose: the early return must happen before
      // getImageLogCollection() is reached.
      const result = await serverFindLog("");

      expect(result).toBeNull();
      expect(findLogEntry).not.toHaveBeenCalled();
      expect(mongoClients()).toHaveLength(0);
    });

    it("returns null without a connection for an input that normalises to empty", async () => {
      const result = await serverFindLog("   ");

      expect(result).toBeNull();
      expect(findLogEntry).not.toHaveBeenCalled();
      expect(mongoClients()).toHaveLength(0);
    });

    it("rethrows database errors without closing the shared connection", async () => {
      const client = await connectSharedDb();
      findLogEntry.mockRejectedValue(new Error("db error"));

      await expect(serverFindLog("error.jpg")).rejects.toThrow("db error");

      expect(client.close).not.toHaveBeenCalled();
    });

    it("throws DbUnavailableError when the server has no connection", async () => {
      await expect(serverFindLog("rover.jpg")).rejects.toThrow(
        NOT_CONNECTED_MESSAGE,
      );

      expect(findLogEntry).not.toHaveBeenCalled();
      expect(mongoClients()).toHaveLength(0);
    });
  });
});
