import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let MockClient;

vi.resetModules();

describe("getImageLogConnection (MongoDB client)", () => {
  beforeEach(() => {
    MockClient = vi.fn(function (uri, options) {
      this.uri = uri;
      this.options = options;
    });

    MockClient.prototype.connect = vi.fn().mockResolvedValue(undefined);
    MockClient.prototype.db = vi.fn().mockReturnValue({
      admin: () => ({
        ping: vi.fn().mockResolvedValue({ ok: 1 }),
      }),
      collection: vi.fn().mockReturnValue({ name: "image-logs" }),
    });
    MockClient.prototype.close = vi.fn().mockResolvedValue(undefined);

    vi.resetModules();
    vi.doMock("mongodb", () => ({ MongoClient: MockClient }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when MONGODB_URI is missing", async () => {
    delete process.env.MONGODB_URI;

    const { getImageLogConnection: getConn } =
      await import("../../../logging/mongodb/client.mjs");
    delete process.env.MONGODB_URI;

    await expect(getConn()).rejects.toThrow(
      "Missing MONGODB_URI environment variable",
    );
  });

  it("throws when MONGODB_URI is empty string", async () => {
    process.env.MONGODB_URI = "";

    const { getImageLogConnection: getConn } =
      await import("../../../logging/mongodb/client.mjs");
    process.env.MONGODB_URI = "";

    await expect(getConn()).rejects.toThrow(
      "Missing MONGODB_URI environment variable",
    );
  });

  it("passes MONGODB_URI to the MongoClient constructor", async () => {
    process.env.MONGODB_URI = "mongodb://custom-host:27017";

    const { getImageLogConnection: getConn } =
      await import("../../../logging/mongodb/client.mjs");
    await getConn();

    expect(MockClient).toHaveBeenCalledWith(
      "mongodb://custom-host:27017",
      expect.any(Object),
    );
  });

  it("creates MongoClient with serverApi version '1', strict, deprecated", async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017";

    const { getImageLogConnection: getConn } =
      await import("../../../logging/mongodb/client.mjs");
    await getConn();

    expect(MockClient).toHaveBeenCalledWith(
      "mongodb://localhost:27017",
      expect.objectContaining({
        serverApi: expect.objectContaining({
          version: "1",
          strict: true,
          deprecated: false,
        }),
      }),
    );
  });

  it("includes maxPoolSize and minPoolSize in options", async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017";

    const { getImageLogConnection: getConn } =
      await import("../../../logging/mongodb/client.mjs");
    await getConn();

    expect(MockClient).toHaveBeenCalledWith(
      "mongodb://localhost:27017",
      expect.objectContaining({
        maxPoolSize: 10,
        minPoolSize: 2,
      }),
    );
  });

  it("calls client.connect() after construction", async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017";

    const { getImageLogConnection: getConn } =
      await import("../../../logging/mongodb/client.mjs");
    await getConn();

    expect(MockClient.prototype.connect).toHaveBeenCalled();
  });

  it("calls client.db() without name to get db handle for ping", async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017";

    const { getImageLogConnection: getConn } =
      await import("../../../logging/mongodb/client.mjs");
    await getConn();

    const dbCalls = MockClient.prototype.db.mock.calls;
    const noNameCall = dbCalls.find(
      (c) => c.length === 0 || c[0] === undefined,
    );
    expect(noNameCall).toBeDefined();
  });

  it("calls client.db('gen-ai') to get the collection", async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017";

    const { getImageLogConnection: getConn } =
      await import("../../../logging/mongodb/client.mjs");
    await getConn();

    const dbCalls = MockClient.prototype.db.mock.calls;
    const genAiCall = dbCalls.find((c) => c[0] === "gen-ai");
    expect(genAiCall).toBeDefined();
  });

  it("returns { client, collection } with expected shape", async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017";

    const { getImageLogConnection: getConn } =
      await import("../../../logging/mongodb/client.mjs");
    const result = await getConn();

    expect(result).toHaveProperty("client");
    expect(result).toHaveProperty("collection");
    expect(result.client).toHaveProperty("uri", "mongodb://localhost:27017");
  });

  it("collection comes from client.db('gen-ai').collection('image-logs')", async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017";

    const { getImageLogConnection: getConn } =
      await import("../../../logging/mongodb/client.mjs");
    await getConn();

    const dbCalls = MockClient.prototype.db.mock.calls;
    const collectionCall = dbCalls.find((c) => c[0] === "gen-ai");
    expect(collectionCall).toBeDefined();
  });

  it("calls client.close() and re-throws when ping fails", async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017";

    const pingErr = new Error("ping failed");
    MockClient.prototype.db = vi.fn(() => ({
      admin: () => ({
        ping: () => Promise.reject(pingErr),
      }),
      collection: vi.fn(() => ({ name: "image-logs" })),
    }));

    const { getImageLogConnection: getConn } =
      await import("../../../logging/mongodb/client.mjs");

    await expect(getConn()).rejects.toThrow("ping failed");
    expect(MockClient.prototype.close).toHaveBeenCalled();
  });

  it("re-throws the original error (not wrapped) after closing client", async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017";

    const customErr = new TypeError("custom mongo error");
    MockClient.prototype.db = vi.fn(() => ({
      admin: () => ({
        ping: () => Promise.reject(customErr),
      }),
      collection: vi.fn(() => ({ name: "image-logs" })),
    }));

    const { getImageLogConnection: getConn } =
      await import("../../../logging/mongodb/client.mjs");

    await expect(getConn()).rejects.toBe(customErr);
    expect(MockClient.prototype.close).toHaveBeenCalledTimes(1);
  });

  it("passes a string (not undefined) to MongoClient when URI exists", async () => {
    process.env.MONGODB_URI = "mongodb://127.0.0.1:27017";

    const { getImageLogConnection: getConn } =
      await import("../../../logging/mongodb/client.mjs");
    await getConn();

    const call = MockClient.mock.calls[0];
    expect(typeof call[0]).toBe("string");
    expect(call[0]).toBe("mongodb://127.0.0.1:27017");
  });
});
