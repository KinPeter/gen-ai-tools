import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * Mirrors tools-hub/utils/db.mjs.
 *
 * The mongodb driver is replaced by the shared mock in
 * test/support/mock-mongodb.mjs, so every test exercises the real lifecycle
 * code (createClient/openDb/closeDb/requireClient) without ever reaching a
 * real database. db.mjs keeps a module-level client, so every test ends with
 * closeDb() to leave the module in the "not connected" state.
 */
import {
  mongoMock,
  mockMongoDriver,
  mongoClients,
  resetMongoMock,
} from "../../support/mock-mongodb.mjs";

vi.mock("mongodb", () => mockMongoDriver());

import { MongoClient } from "mongodb";
import {
  DbUnavailableError,
  closeDb,
  getCollection,
  getImageLogCollection,
  openDb,
} from "../../../tools-hub/utils/db.mjs";

const MONGODB_URI = "mongodb://mock-host:27017";
const NOT_CONNECTED_MESSAGE =
  "MongoDB is not connected: the server could not open a connection at startup.";
const CONNECTED_MESSAGE = "tools-hub: MongoDB connected";
const CLOSED_MESSAGE = "tools-hub: MongoDB connection closed";

function grabThrown(fn) {
  try {
    fn();
    return null;
  } catch (err) {
    return err;
  }
}

afterEach(async () => {
  resetMongoMock();
  await closeDb();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("tools-hub/utils/db", () => {
  describe("before any connection is opened", () => {
    it("getImageLogCollection throws DbUnavailableError and opens no client", () => {
      vi.stubEnv("MONGODB_URI", MONGODB_URI);

      const err = grabThrown(getImageLogCollection);

      expect(err).toBeInstanceOf(DbUnavailableError);
      expect(err.message).toBe(NOT_CONNECTED_MESSAGE);
      expect(MongoClient).not.toHaveBeenCalled();
      expect(mongoClients()).toHaveLength(0);
    });

    it("getCollection throws DbUnavailableError for any collection name", () => {
      vi.stubEnv("MONGODB_URI", MONGODB_URI);

      const err = grabThrown(() => getCollection("some-logs"));

      expect(err).toBeInstanceOf(DbUnavailableError);
      expect(err.message).toBe(NOT_CONNECTED_MESSAGE);
    });

    it("closeDb is a no-op when the server never connected", async () => {
      vi.stubEnv("MONGODB_URI", MONGODB_URI);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await closeDb();

      expect(MongoClient).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalledWith(CLOSED_MESSAGE);
    });

    it("DbUnavailableError keeps its message and is not a plain Error", () => {
      const err = new DbUnavailableError("boom");

      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe("boom");
      expect(new Error("boom")).not.toBeInstanceOf(DbUnavailableError);
    });
  });

  describe("openDb", () => {
    it("throws when MONGODB_URI is not set and creates no client", async () => {
      vi.stubEnv("MONGODB_URI", undefined);

      await expect(openDb()).rejects.toThrow(
        "Missing MONGODB_URI environment variable. Set it to connect to MongoDB.",
      );
      expect(MongoClient).not.toHaveBeenCalled();
    });

    it("throws when MONGODB_URI is an empty string", async () => {
      vi.stubEnv("MONGODB_URI", "");

      await expect(openDb()).rejects.toThrow("Missing MONGODB_URI");
      expect(MongoClient).not.toHaveBeenCalled();
    });

    it("connects, pings, logs and returns the client built from MONGODB_URI", async () => {
      vi.stubEnv("MONGODB_URI", MONGODB_URI);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const client = await openDb();

      expect(MongoClient).toHaveBeenCalledTimes(1);
      expect(client.uri).toBe(MONGODB_URI);
      expect(client.options).toEqual({
        serverApi: { version: "1", strict: true, deprecated: false },
        maxPoolSize: 10,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 5000,
      });
      expect(client.connect).toHaveBeenCalledTimes(1);
      expect(client.db().admin().ping).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(CONNECTED_MESSAGE);
    });

    it("is idempotent: a second call reuses the connected client", async () => {
      vi.stubEnv("MONGODB_URI", MONGODB_URI);

      const first = await openDb();
      const second = await openDb();

      expect(second).toBe(first);
      expect(MongoClient).toHaveBeenCalledTimes(1);
      expect(first.connect).toHaveBeenCalledTimes(1);
    });

    it("closes the candidate client and rethrows when connecting fails", async () => {
      vi.stubEnv("MONGODB_URI", MONGODB_URI);
      mongoMock.connectFailure = new Error("connection refused");
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await expect(openDb()).rejects.toThrow("connection refused");

      const candidates = mongoClients();
      expect(candidates).toHaveLength(1);
      expect(candidates[0].close).toHaveBeenCalledTimes(1);
      expect(logSpy).not.toHaveBeenCalledWith(CONNECTED_MESSAGE);

      // The failed candidate must never become the shared client.
      const err = grabThrown(() => getCollection("image-logs"));
      expect(err).toBeInstanceOf(DbUnavailableError);
    });

    it("rethrows the close error when closing the failed candidate fails", async () => {
      vi.stubEnv("MONGODB_URI", MONGODB_URI);
      mongoMock.connectFailure = new Error("connection refused");
      mongoMock.closeFailure = new Error("close failed during failed connect");
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      // The failed candidate is closed and the original connect error is
      // replaced by the close error: openDb's catch awaits close() before
      // rethrowing, so a failing close masks the connect failure. Documented
      // behaviour, flagged as a smell in the test-fix report.
      await expect(openDb()).rejects.toThrow(
        "close failed during failed connect",
      );

      const candidates = mongoClients();
      expect(candidates).toHaveLength(1);
      expect(candidates[0].close).toHaveBeenCalledTimes(1);
      expect(logSpy).not.toHaveBeenCalledWith(CONNECTED_MESSAGE);

      // Nothing was left connected, so the getters still report no connection.
      const err = grabThrown(getImageLogCollection);
      expect(err).toBeInstanceOf(DbUnavailableError);
    });

    it("closes the candidate client and rethrows when the ping fails", async () => {
      vi.stubEnv("MONGODB_URI", MONGODB_URI);
      mongoMock.pingFailure = new Error("no server selected");
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await expect(openDb()).rejects.toThrow("no server selected");

      const candidates = mongoClients();
      expect(candidates).toHaveLength(1);
      expect(candidates[0].connect).toHaveBeenCalledTimes(1);
      expect(candidates[0].close).toHaveBeenCalledTimes(1);
      expect(logSpy).not.toHaveBeenCalledWith(CONNECTED_MESSAGE);
    });
  });

  describe("collection getters", () => {
    it("getCollection returns the requested collection on the gen-ai database", async () => {
      vi.stubEnv("MONGODB_URI", MONGODB_URI);
      const client = await openDb();

      const collection = getCollection("run-logs");

      expect(collection.dbName).toBe("gen-ai");
      expect(collection.collectionName).toBe("run-logs");
      expect(client.db).toHaveBeenCalledWith("gen-ai");
    });

    it("getImageLogCollection returns the image-logs collection of gen-ai", async () => {
      vi.stubEnv("MONGODB_URI", MONGODB_URI);
      await openDb();

      const collection = getImageLogCollection();

      expect(collection.dbName).toBe("gen-ai");
      expect(collection.collectionName).toBe("image-logs");
    });

    it("getCollection does not guard against a missing collection name", async () => {
      vi.stubEnv("MONGODB_URI", MONGODB_URI);
      await openDb();

      const collection = getCollection();

      // The name is forwarded to the driver untouched: there is no default.
      expect(collection.dbName).toBe("gen-ai");
      expect(collection.collectionName).toBeUndefined();
    });

    it("repeated getters reuse the same database and collection objects", async () => {
      vi.stubEnv("MONGODB_URI", MONGODB_URI);
      const client = await openDb();

      // openDb pings db(), and both getters resolve the same gen-ai db.
      expect(getImageLogCollection()).toBe(getImageLogCollection());
      expect(client.db).toHaveBeenCalledTimes(3);
      expect(client.db).toHaveBeenCalledWith("gen-ai");
    });

    it("throws DbUnavailableError once the shared connection is closed", async () => {
      vi.stubEnv("MONGODB_URI", MONGODB_URI);
      await openDb();
      await closeDb();

      const err = grabThrown(getImageLogCollection);

      expect(err).toBeInstanceOf(DbUnavailableError);
      expect(err.message).toBe(NOT_CONNECTED_MESSAGE);
    });
  });

  describe("closeDb", () => {
    it("closes the shared client and logs", async () => {
      vi.stubEnv("MONGODB_URI", MONGODB_URI);
      const client = await openDb();
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await closeDb();

      expect(client.close).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(CLOSED_MESSAGE);
    });

    it("does not close the client twice on repeated calls", async () => {
      vi.stubEnv("MONGODB_URI", MONGODB_URI);
      const client = await openDb();

      await closeDb();
      await closeDb();

      expect(client.close).toHaveBeenCalledTimes(1);
    });

    it("nulls the client before awaiting close so a failed close is not retried", async () => {
      vi.stubEnv("MONGODB_URI", MONGODB_URI);
      const client = await openDb();
      mongoMock.closeFailure = new Error("close failed");

      await expect(closeDb()).rejects.toThrow("close failed");

      const err = grabThrown(getImageLogCollection);
      expect(err).toBeInstanceOf(DbUnavailableError);

      // The client is already dropped, so a second closeDb is a no-op.
      await closeDb();
      expect(client.close).toHaveBeenCalledTimes(1);
    });

    it("openDb reconnects after the connection was closed", async () => {
      vi.stubEnv("MONGODB_URI", MONGODB_URI);
      const first = await openDb();
      await closeDb();
      const second = await openDb();

      expect(second).not.toBe(first);
      expect(MongoClient).toHaveBeenCalledTimes(2);
      expect(mongoClients()).toHaveLength(2);
    });
  });
});
