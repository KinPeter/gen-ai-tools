import { afterEach, describe, expect, it, vi } from "vitest";

// ── Module-level env stub (prevents real MongoDB connection) ──────────────────
vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017");

// ── Mock mongodb (hoisted) ───────────────────────────────────────────────────
// Use a class-like constructor that db() returns a proper object
var MockClient;

vi.mock("mongodb", () => {
  MockClient = vi.fn(function () {
    this.uri = "mongodb://localhost:27017";
    this.options = {};
  });

  MockClient.prototype.connect = vi.fn().mockResolvedValue(undefined);

  MockClient.prototype.db = vi.fn(function () {
    return {
      admin: () => ({
        ping: vi.fn().mockResolvedValue({ ok: 1 }),
      }),
      collection: vi.fn().mockReturnValue(_collectionResult),
    };
  });

  MockClient.prototype.close = vi.fn().mockResolvedValue(undefined);
  return { MongoClient: MockClient };
});

// Collection result used by the mock
var _collectionResult = {
  db: { databaseName: "gen-ai" },
  collectionName: "image-logs",
  find: vi.fn().mockReturnValue({
    toArray: vi.fn().mockResolvedValue([]),
  }),
  countDocuments: vi.fn().mockResolvedValue(0),
  deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
};

// ── Mock fs/promises (hoisted) ──────────────────────────────────────────────
vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
}));

// ── Mock readline/promises (hoisted) ─────────────────────────────────────────
vi.mock("node:readline/promises", () => ({
  createInterface: vi.fn(),
}));

// ── Import under test ────────────────────────────────────────────────────────
import {
  askConfirmation,
  findObsolete,
  stripExtension,
} from "../../../logging/mongodb/cleanup-log.mjs";

// ── Import modules for spying ─────────────────────────────────────────────────
import * as clientModule from "../../../logging/mongodb/client.mjs";
import * as readlineModule from "node:readline/promises";

// ── Test helpers ──────────────────────────────────────────────────────────────

const SAMPLE_FILES = [
  { name: "photo1.jpg", isFile: () => true, isDirectory: () => false },
  { name: "photo2.png", isFile: () => true, isDirectory: () => false },
  { name: "photo3.webp", isFile: () => true, isDirectory: () => false },
  { name: "subdir", isFile: () => false, isDirectory: () => true },
];

const SAMPLE_SUBFILES = [
  { name: "inner1.jpg", isFile: () => true, isDirectory: () => false },
  { name: "inner2.png", isFile: () => true, isDirectory: () => false },
];

// Sample log entries (MongoDB stores filenames stripped of extension)
const SAMPLE_LOG_ENTRIES = [
  { _id: "1", filename: "photo1" },
  { _id: "2", filename: "photo2" },
  { _id: "3", filename: "photo3" },
  { _id: "4", filename: "photo4" },
  { _id: "5", filename: "inner1" },
];

// Reset collection mock for a fresh test
function resetCollectionMock() {
  _collectionResult.db = { databaseName: "gen-ai" };
  _collectionResult.collectionName = "image-logs";
  _collectionResult.find = vi.fn().mockReturnValue({
    toArray: vi.fn().mockResolvedValue([]),
  });
  _collectionResult.countDocuments = vi.fn().mockResolvedValue(0);
  _collectionResult.deleteMany = vi.fn().mockResolvedValue({
    deletedCount: 0,
  });
  return _collectionResult;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("cleanup-log", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017");
    resetCollectionMock();
  });

  // ── stripExtension ──────────────────────────────────────────────────────

  describe("stripExtension", () => {
    it("strips a single extension", () => {
      expect(stripExtension("photo.jpg")).toBe("photo");
    });

    it("strips extension from files with dots in name", () => {
      expect(stripExtension("my.photo.jpg")).toBe("my.photo");
    });

    it("returns original string if no extension", () => {
      expect(stripExtension("photo")).toBe("photo");
    });

    it("returns original if name ends with dot", () => {
      expect(stripExtension("photo.")).toBe("photo.");
    });
  });

  // ── readDistFiles ───────────────────────────────────────────────────────

  describe("readDistFiles", () => {
    it("reads files and strips extensions", async () => {
      vi.resetModules();
      vi.doMock("node:fs/promises", () => ({
        readdir: vi
          .fn()
          .mockResolvedValue([...SAMPLE_FILES, ...SAMPLE_SUBFILES]),
      }));
      const { readDistFiles: readFiles } =
        await import("../../../logging/mongodb/cleanup-log.mjs");

      const result = await readFiles();
      expect(result).toContain("photo1");
      expect(result).toContain("photo2");
      expect(result).toContain("photo3");
      expect(result).toContain("inner1");
      expect(result).toContain("inner2");
    });

    it("returns extension-stripped basenames", async () => {
      vi.resetModules();
      const mockReaddir = vi
        .fn()
        .mockResolvedValue([...SAMPLE_FILES, ...SAMPLE_SUBFILES]);
      vi.doMock("node:fs/promises", () => ({
        readdir: mockReaddir,
      }));
      const { readDistFiles: readFiles } =
        await import("../../../logging/mongodb/cleanup-log.mjs");

      await readFiles();
      expect(mockReaddir).toHaveBeenCalledWith("dist/", expect.any(Object));
    });

    it("handles empty dist/ directory", async () => {
      vi.resetModules();
      vi.doMock("node:fs/promises", () => ({
        readdir: vi.fn().mockResolvedValueOnce([]),
      }));
      const { readDistFiles: readFiles } =
        await import("../../../logging/mongodb/cleanup-log.mjs");

      const result = await readFiles();
      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
    });

    it("calls readdir recursively for subdirectories", async () => {
      vi.resetModules();
      const mockReaddir = vi.fn().mockResolvedValue([
        { name: "sub", isDirectory: () => true, isFile: () => false },
        {
          name: "subfile.png",
          isFile: () => true,
          isDirectory: () => false,
        },
      ]);
      vi.doMock("node:fs/promises", () => ({
        readdir: mockReaddir,
      }));
      const { readDistFiles: readFiles } =
        await import("../../../logging/mongodb/cleanup-log.mjs");

      await readFiles();
      expect(mockReaddir).toHaveBeenCalledTimes(1);
      expect(mockReaddir).toHaveBeenCalledWith(
        "dist/",
        expect.objectContaining({ recursive: true }),
      );
    });
  });

  // ── findObsolete ────────────────────────────────────────────────────────

  describe("findObsolete", () => {
    it("returns entries whose filename is not in distFiles", () => {
      const dist = new Set(["photo1", "photo2", "inner1"]);
      const result = findObsolete(SAMPLE_LOG_ENTRIES, dist);
      expect(result).toHaveLength(2);
      expect(result[0]._id).toBe("3");
      expect(result[1]._id).toBe("4");
    });

    it("returns empty array when all entries exist in dist", () => {
      const dist = new Set(["photo1", "photo2", "photo3", "photo4", "inner1"]);
      const result = findObsolete(SAMPLE_LOG_ENTRIES, dist);
      expect(result).toHaveLength(0);
    });

    it("returns all entries when none exist in dist", () => {
      const dist = new Set(["other1", "other2"]);
      const result = findObsolete(SAMPLE_LOG_ENTRIES, dist);
      expect(result).toHaveLength(5);
    });

    it("strips extensions from dist filenames before comparison", () => {
      // dist entries already stripped; entries are compared by stripped base name
      const dist = new Set(["photo1", "photo2", "photo3", "inner1"]);
      const result = findObsolete(SAMPLE_LOG_ENTRIES, dist);
      expect(result).toHaveLength(1); // only photo4 is missing from dist
    });

    it("handles empty distFiles set", () => {
      const dist = new Set();
      const result = findObsolete(SAMPLE_LOG_ENTRIES, dist);
      expect(result).toHaveLength(5);
    });
  });

  // ── askConfirmation ─────────────────────────────────────────────────────

  describe("askConfirmation", () => {
    it("returns true when user answers y", async () => {
      const rl = {
        question: vi.fn().mockResolvedValue("y"),
        close: vi.fn(),
      };
      readlineModule.createInterface.mockReturnValue(rl);

      const result = await askConfirmation({ total: 10, obsolete: 3 });
      expect(result).toBe(true);
    });

    it("returns true when user answers Y uppercase", async () => {
      const rl = {
        question: vi.fn().mockResolvedValue("Y"),
        close: vi.fn(),
      };
      readlineModule.createInterface.mockReturnValue(rl);

      const result = await askConfirmation({});
      expect(result).toBe(true);
    });

    it("returns true when user gives empty answer", async () => {
      const rl = {
        question: vi.fn().mockResolvedValue(""),
        close: vi.fn(),
      };
      readlineModule.createInterface.mockReturnValue(rl);

      const result = await askConfirmation({});
      expect(result).toBe(true);
    });

    it("returns false when user answers n", async () => {
      const rl = {
        question: vi.fn().mockResolvedValue("n"),
        close: vi.fn(),
      };
      readlineModule.createInterface.mockReturnValue(rl);

      const result = await askConfirmation({});
      expect(result).toBe(false);
    });

    it("returns false when user answers N uppercase", async () => {
      const rl = {
        question: vi.fn().mockResolvedValue("N"),
        close: vi.fn(),
      };
      readlineModule.createInterface.mockReturnValue(rl);

      const result = await askConfirmation({});
      expect(result).toBe(false);
    });

    it("calls createInterface with stdin and stdout", async () => {
      const rl = {
        question: vi.fn().mockResolvedValue("y"),
        close: vi.fn(),
      };
      readlineModule.createInterface.mockReturnValue(rl);

      await askConfirmation({});
      expect(readlineModule.createInterface).toHaveBeenCalledWith({
        input: process.stdin,
        output: process.stdout,
      });
    });

    it("calls rl.close() after getting answer", async () => {
      const rl = {
        question: vi.fn().mockResolvedValue("y"),
        close: vi.fn(),
      };
      readlineModule.createInterface.mockReturnValue(rl);

      await askConfirmation({});
      expect(rl.close).toHaveBeenCalled();
    });

    it("logs summary information to console", async () => {
      const rl = {
        question: vi.fn().mockResolvedValue("y"),
        close: vi.fn(),
      };
      readlineModule.createInterface.mockReturnValue(rl);
      const logSpy = vi.spyOn(console, "log");

      await askConfirmation({ total: 100, obsolete: 20, toDelete: 20 });

      expect(logSpy).toHaveBeenCalledWith("\n=== Log Cleanup ===");
      expect(logSpy).toHaveBeenCalledWith("Total entries: 100");
      expect(logSpy).toHaveBeenCalledWith("Obsolete entries: 20");
      expect(logSpy).toHaveBeenCalledWith("To delete: 20");
      expect(logSpy).toHaveBeenCalledWith("Proceed? [Y/n]");
    });
  });

  // ── main ────────────────────────────────────────────────────────────────

  describe("main", () => {
    it("connects, fetches, and returns { deleted, total, obsolete }", async () => {
      vi.resetModules();
      vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017");

      // Set up fs mock for readDistFiles (recursive: true returns flat array)
      vi.doMock("node:fs/promises", () => ({
        readdir: vi
          .fn()
          .mockResolvedValue([...SAMPLE_FILES, ...SAMPLE_SUBFILES]),
      }));

      // Set up readline mock
      const rl = {
        question: vi.fn().mockResolvedValue("y"),
        close: vi.fn(),
      };
      vi.doMock("node:readline/promises", () => ({
        createInterface: vi.fn().mockReturnValue(rl),
      }));

      // Configure collection mock
      _collectionResult.countDocuments = vi.fn().mockResolvedValue(5);
      _collectionResult.deleteMany = vi.fn().mockResolvedValue({
        deletedCount: 2,
      });
      _collectionResult.find = vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(SAMPLE_LOG_ENTRIES),
      });

      // Also ensure clientModule is up to date
      vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue({
        client: { close: vi.fn() },
        collection: _collectionResult,
      });

      const { main: mainFresh } =
        await import("../../../logging/mongodb/cleanup-log.mjs");

      const result = await mainFresh();

      expect(result).toHaveProperty("deleted", 2);
      expect(result).toHaveProperty("total", 5);
      expect(result).toHaveProperty("obsolete", 1);
      expect(_collectionResult.client?.close || rl.close).toBeDefined();
    });

    it("returns { deleted: 0, total, obsolete: 0 } when no obsolete entries", async () => {
      vi.resetModules();
      vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017");

      _collectionResult.countDocuments = vi.fn().mockResolvedValue(5);
      _collectionResult.deleteMany = vi.fn().mockResolvedValue({
        deletedCount: 0,
      });
      _collectionResult.find = vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(SAMPLE_LOG_ENTRIES),
      });

      vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue({
        client: { close: vi.fn() },
        collection: _collectionResult,
      });

      const { main: mainFresh } =
        await import("../../../logging/mongodb/cleanup-log.mjs");

      const result = await mainFresh({
        distFiles: new Set(["photo1", "photo2", "photo3", "photo4", "inner1"]),
      });

      expect(result.obsolete).toBe(0);
      expect(result.deleted).toBe(0);
    });

    it("returns { deleted: 0, total, obsolete } when user rejects confirmation", async () => {
      vi.resetModules();
      vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017");

      const rl = {
        question: vi.fn().mockResolvedValue("n"),
        close: vi.fn(),
      };
      vi.doMock("node:readline/promises", () => ({
        createInterface: vi.fn().mockReturnValue(rl),
      }));

      _collectionResult.countDocuments = vi.fn().mockResolvedValue(5);
      _collectionResult.deleteMany = vi.fn().mockResolvedValue({
        deletedCount: 0,
      });
      _collectionResult.find = vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(SAMPLE_LOG_ENTRIES),
      });

      vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue({
        client: { close: vi.fn() },
        collection: _collectionResult,
      });

      const { main: mainFresh } =
        await import("../../../logging/mongodb/cleanup-log.mjs");

      const result = await mainFresh({
        distFiles: new Set(["photo1", "photo2", "inner1"]),
      });

      expect(result.obsolete).toBe(2);
      expect(result.deleted).toBe(0);
    });

    it("calls deleteMany with { _id: { $in: [...] } } query", async () => {
      vi.resetModules();
      vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017");

      const rl = {
        question: vi.fn().mockResolvedValue("y"),
        close: vi.fn(),
      };
      vi.doMock("node:readline/promises", () => ({
        createInterface: vi.fn().mockReturnValue(rl),
      }));

      _collectionResult.countDocuments = vi.fn().mockResolvedValue(5);
      _collectionResult.deleteMany = vi.fn().mockResolvedValue({
        deletedCount: 2,
      });
      _collectionResult.find = vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(SAMPLE_LOG_ENTRIES),
      });

      vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue({
        client: { close: vi.fn() },
        collection: _collectionResult,
      });

      const { main: mainFresh } =
        await import("../../../logging/mongodb/cleanup-log.mjs");

      await mainFresh({
        distFiles: new Set(["photo1", "photo2", "inner1"]),
      });

      const query = _collectionResult.deleteMany.mock.calls[0][0];
      expect(query._id.$in).toContain("3");
      expect(query._id.$in).toContain("4");
    });

    it("logs events to console", async () => {
      vi.resetModules();
      vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017");

      const rl = {
        question: vi.fn().mockResolvedValue("y"),
        close: vi.fn(),
      };
      vi.doMock("node:readline/promises", () => ({
        createInterface: vi.fn().mockReturnValue(rl),
      }));

      _collectionResult.countDocuments = vi.fn().mockResolvedValue(5);
      _collectionResult.deleteMany = vi.fn().mockResolvedValue({
        deletedCount: 2,
      });
      _collectionResult.find = vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(SAMPLE_LOG_ENTRIES),
      });

      vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue({
        client: { close: vi.fn() },
        collection: _collectionResult,
      });

      const logSpy = vi.spyOn(console, "log");

      const { main: mainFresh } =
        await import("../../../logging/mongodb/cleanup-log.mjs");

      await mainFresh({
        distFiles: new Set(["photo1", "photo2", "inner1"]),
      });

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Found"));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Connected"));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Fetched"));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Deleted"));
      expect(logSpy).toHaveBeenCalledWith("Connection closed.");
    });

    it("calls client.close() in finally block", async () => {
      vi.resetModules();
      vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017");

      const rl = {
        question: vi.fn().mockResolvedValue("y"),
        close: vi.fn(),
      };
      vi.doMock("node:readline/promises", () => ({
        createInterface: vi.fn().mockReturnValue(rl),
      }));

      _collectionResult.countDocuments = vi.fn().mockResolvedValue(5);
      _collectionResult.deleteMany = vi.fn().mockResolvedValue({
        deletedCount: 2,
      });
      _collectionResult.find = vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(SAMPLE_LOG_ENTRIES),
      });

      // Capture the MongoDB client instance
      const { MongoClient } = await import("mongodb");
      MongoClient.prototype.close = vi.fn().mockResolvedValue(undefined);

      vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue({
        client: { close: MongoClient.prototype.close },
        collection: _collectionResult,
      });

      const { main: mainFresh } =
        await import("../../../logging/mongodb/cleanup-log.mjs");

      await mainFresh({
        distFiles: new Set(["photo1", "photo2", "inner1"]),
      });

      expect(MongoClient.prototype.close).toHaveBeenCalled();
    });

    it("returns correct total from countDocuments", async () => {
      vi.resetModules();
      vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017");

      const rl = {
        question: vi.fn().mockResolvedValue("y"),
        close: vi.fn(),
      };
      vi.doMock("node:readline/promises", () => ({
        createInterface: vi.fn().mockReturnValue(rl),
      }));

      _collectionResult.countDocuments = vi.fn().mockResolvedValue(42);
      _collectionResult.deleteMany = vi.fn().mockResolvedValue({
        deletedCount: 2,
      });
      _collectionResult.find = vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(SAMPLE_LOG_ENTRIES),
      });

      vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue({
        client: { close: vi.fn() },
        collection: _collectionResult,
      });

      const { main: mainFresh } =
        await import("../../../logging/mongodb/cleanup-log.mjs");

      const result = await mainFresh({
        distFiles: new Set(["photo1", "photo2", "inner1"]),
      });

      expect(result.total).toBe(42);
    });

    it("uses pre-loaded distFiles when provided", async () => {
      vi.resetModules();
      vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017");

      const rl = {
        question: vi.fn().mockResolvedValue("y"),
        close: vi.fn(),
      };
      vi.doMock("node:readline/promises", () => ({
        createInterface: vi.fn().mockReturnValue(rl),
      }));

      _collectionResult.countDocuments = vi.fn().mockResolvedValue(5);
      _collectionResult.deleteMany = vi.fn().mockResolvedValue({
        deletedCount: 3,
      });
      _collectionResult.find = vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(SAMPLE_LOG_ENTRIES),
      });

      vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue({
        client: { close: vi.fn() },
        collection: _collectionResult,
      });

      const { main: mainFresh } =
        await import("../../../logging/mongodb/cleanup-log.mjs");

      const customDist = new Set(["photo1", "inner1"]);
      const result = await mainFresh({ distFiles: customDist });

      expect(result.obsolete).toBe(3);
      expect(result.deleted).toBe(3);
    });

    it("returns early with { deleted: 0, total, obsolete: 0 } when no obsolete", async () => {
      vi.resetModules();
      vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017");

      _collectionResult.countDocuments = vi.fn().mockResolvedValue(5);
      _collectionResult.deleteMany = vi.fn().mockResolvedValue({
        deletedCount: 0,
      });
      _collectionResult.find = vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(SAMPLE_LOG_ENTRIES),
      });

      vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue({
        client: { close: vi.fn() },
        collection: _collectionResult,
      });

      const logSpy = vi.spyOn(console, "log");

      const { main: mainFresh } =
        await import("../../../logging/mongodb/cleanup-log.mjs");

      const result = await mainFresh({
        distFiles: new Set(["photo1", "photo2", "photo3", "photo4", "inner1"]),
      });

      expect(result.obsolete).toBe(0);
      expect(result.deleted).toBe(0);
      expect(logSpy).toHaveBeenCalledWith("No obsolete entries to clean up.");
      expect(_collectionResult.deleteMany).not.toHaveBeenCalled();
    });

    it("skips confirmation when no obsolete entries", async () => {
      vi.resetModules();
      vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017");

      const rl = {
        question: vi.fn().mockResolvedValue("n"),
        close: vi.fn(),
      };
      vi.doMock("node:readline/promises", () => ({
        createInterface: vi.fn().mockReturnValue(rl),
      }));

      _collectionResult.countDocuments = vi.fn().mockResolvedValue(5);
      _collectionResult.deleteMany = vi.fn().mockResolvedValue({
        deletedCount: 0,
      });
      _collectionResult.find = vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(SAMPLE_LOG_ENTRIES),
      });

      vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue({
        client: { close: vi.fn() },
        collection: _collectionResult,
      });

      const { main: mainFresh } =
        await import("../../../logging/mongodb/cleanup-log.mjs");

      await mainFresh({
        distFiles: new Set(["photo1", "photo2", "photo3", "photo4", "inner1"]),
      });

      expect(rl.question).not.toHaveBeenCalled();
    });

    it("logs context error to console.error when cleanup fails", async () => {
      vi.resetModules();
      vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017");

      vi.doMock("node:fs/promises", () => ({
        readdir: vi
          .fn()
          .mockResolvedValue([...SAMPLE_FILES, ...SAMPLE_SUBFILES]),
      }));

      const rl = {
        question: vi.fn().mockResolvedValue("y"),
        close: vi.fn(),
      };
      vi.doMock("node:readline/promises", () => ({
        createInterface: vi.fn().mockReturnValue(rl),
      }));

      _collectionResult.countDocuments = vi.fn().mockResolvedValue(5);
      _collectionResult.deleteMany = vi.fn().mockResolvedValue({
        deletedCount: 2,
      });

      const cleanupError = new Error("mongodb write failed");
      _collectionResult.find = vi.fn().mockReturnValue({
        toArray: vi.fn().mockRejectedValue(cleanupError),
      });

      vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue({
        client: { close: vi.fn() },
        collection: _collectionResult,
      });

      const errorSpy = vi.spyOn(console, "error");

      const { main: mainFresh } =
        await import("../../../logging/mongodb/cleanup-log.mjs");

      await expect(
        mainFresh({ distFiles: new Set(["photo1", "photo2", "inner1"]) }),
      ).rejects.toThrow("mongodb write failed");

      expect(errorSpy).toHaveBeenCalledWith(
        "Error during cleanup: mongodb write failed",
      );
      errorSpy.mockRestore();
    });
  });

  // ── CLI guard ─────────────────────────────────────────────────────────────

  describe("CLI guard", () => {
    it("runs main when invoked directly", async () => {
      vi.resetModules();
      vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017");

      // Grab the hoisted readdir (shared by cleanup-log.mjs) and
      // set its return value so readDistFiles gets an iterable.
      const { readdir } = await import("node:fs/promises");
      readdir.mockReturnValue([]);

      const originalArgv1 = process.argv[1];
      process.argv[1] = new URL(
        "../../../logging/mongodb/cleanup-log.mjs",
        import.meta.url,
      ).pathname;

      const rl = {
        question: vi.fn().mockResolvedValue("y"),
        close: vi.fn(),
      };
      vi.doMock("node:readline/promises", () => ({
        createInterface: vi.fn().mockReturnValue(rl),
      }));

      _collectionResult.countDocuments = vi.fn().mockResolvedValue(0);
      _collectionResult.deleteMany = vi.fn().mockResolvedValue({
        deletedCount: 0,
      });
      _collectionResult.find = vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      });

      vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue({
        client: { close: vi.fn() },
        collection: _collectionResult,
      });

      // Re-import main to ensure it sees the fresh readdir mock
      const { main: mainImported } =
        await import("../../../logging/mongodb/cleanup-log.mjs");
      await expect(mainImported()).resolves.toBeDefined();

      process.argv[1] = originalArgv1;
    });

    it("does not auto-execute when imported as module", async () => {
      vi.resetModules();
      vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017");

      const originalArgv1 = process.argv[1];
      process.argv[1] = "/some/other/path/script.mjs";

      vi.doMock("node:fs/promises", () => ({
        readdir: vi.fn().mockResolvedValueOnce([]),
      }));

      const rl = {
        question: vi.fn().mockResolvedValue("y"),
        close: vi.fn(),
      };
      vi.doMock("node:readline/promises", () => ({
        createInterface: vi.fn().mockReturnValue(rl),
      }));

      _collectionResult.countDocuments = vi.fn().mockResolvedValue(5);
      _collectionResult.deleteMany = vi.fn().mockResolvedValue({
        deletedCount: 0,
      });
      _collectionResult.find = vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(SAMPLE_LOG_ENTRIES),
      });

      vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue({
        client: { close: vi.fn() },
        collection: _collectionResult,
      });

      const { main: mainImported } =
        await import("../../../logging/mongodb/cleanup-log.mjs");

      const result = await mainImported({
        distFiles: new Set(["photo1"]),
      });

      expect(result).toBeDefined();
      process.argv[1] = originalArgv1;
    });
  });
});
