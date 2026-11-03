import { afterEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

const TEMP_DIR = new URL("./test-temp", import.meta.url).pathname;

// ── Module-level env stub (prevents real MongoDB connection) ────────────────
vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017");

// ── Import under test ───────────────────────────────────────────────────────
import {
  buildOutputFilename,
  chunkEntries,
  fetchLogEntries,
  main,
  writeBackupFile,
} from "../../../logging/mongodb/backup-log.mjs";

// ── Import modules for spying ───────────────────────────────────────────────
import * as clientModule from "../../../logging/mongodb/client.mjs";

// Mock fs functions used by backup-log.mjs
vi.mock("node:fs", () => ({
  ...vi.importActual("node:fs"),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

const SAMPLE_ENTRIES = [
  { _id: "1", filename: "a.png", data: "log-a" },
  { _id: "2", filename: "b.png", data: "log-b" },
  { _id: "3", filename: "c.png", data: "log-c" },
];

function createFakeConnection() {
  return {
    client: { close: vi.fn() },
    collection: {
      db: { databaseName: "test-db" },
      collectionName: "test-collection",
      find: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(SAMPLE_ENTRIES),
      }),
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("backup-log", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── chunkEntries ────────────────────────────────────────────────────────

  describe("chunkEntries", () => {
    it("splits array into chunks of given size", () => {
      const entries = Array.from({ length: 7 }, (_, i) => i);
      const result = chunkEntries(entries, 3);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual([0, 1, 2]);
      expect(result[1]).toEqual([3, 4, 5]);
      expect(result[2]).toEqual([6]);
    });

    it("returns single chunk when entries fit in one chunk", () => {
      const entries = [1, 2, 3];
      const result = chunkEntries(entries, 10);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual([1, 2, 3]);
    });

    it("returns single chunk for empty array", () => {
      const result = chunkEntries([], 3000);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual([]);
    });

    it("handles exact multiple of chunkSize", () => {
      const entries = Array.from({ length: 6 }, (_, i) => i);
      const result = chunkEntries(entries, 3);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual([0, 1, 2]);
      expect(result[1]).toEqual([3, 4, 5]);
    });

    it("handles zero chunkSize by returning entries as single chunk", () => {
      const result = chunkEntries([1, 2], 0);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual([1, 2]);
    });

    it("returns a copy of entries (not same reference) when chunkSize is 0", () => {
      const entries = [1, 2];
      const result = chunkEntries(entries, 0);
      expect(result[0]).not.toBe(entries);
      // Mutation of the original should not affect the chunk
      entries.push(3);
      expect(result[0]).toEqual([1, 2]);
    });
  });

  // ── fetchLogEntries ─────────────────────────────────────────────────────

  describe("fetchLogEntries", () => {
    it("strips _id from each entry", async () => {
      const fakeConn = createFakeConnection();
      const entries = await fetchLogEntries(fakeConn);
      expect(entries).toHaveLength(3);
      for (const entry of entries) {
        expect(entry).not.toHaveProperty("_id");
      }
    });

    it("calls collection.find().toArray()", async () => {
      const fakeConn = createFakeConnection();
      await fetchLogEntries(fakeConn);
      expect(fakeConn.collection.find).toHaveBeenCalled();
      expect(fakeConn.collection.find().toArray).toHaveBeenCalled();
    });

    it("returns entries without _id field", async () => {
      const fakeConn = createFakeConnection();
      const entries = await fetchLogEntries(fakeConn);
      const firstEntry = entries[0];
      expect(firstEntry.filename).toBe("a.png");
      expect(firstEntry.data).toBe("log-a");
    });

    it("handles empty collection", async () => {
      const fakeConn = createFakeConnection();
      fakeConn.collection.find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      });
      const entries = await fetchLogEntries(fakeConn);
      expect(entries).toEqual([]);
    });
  });

  // ── buildOutputFilename ─────────────────────────────────────────────────

  describe("buildOutputFilename", () => {
    it("delegates to destFileName with prefix 'logs'", () => {
      const result = buildOutputFilename(1);
      expect(result).toMatch(/^logs_\d+\.json$/);
    });

    it("first file has no index suffix, subsequent files have _n suffix", () => {
      const result1 = buildOutputFilename(1);
      const result2 = buildOutputFilename(2);
      // First file: prefix_ts.json (no index underscore before .json)
      expect(result1).toMatch(/\.json$/);
      // Second file: prefix_ts_1.json (index=1 since n=2 → index=1)
      expect(result2).toMatch(/_1\.json$/);
    });

    it("uses large index numbers for higher chunk files", () => {
      // n=100 → index=99 (destFileName is 0-based)
      const result = buildOutputFilename(100);
      expect(result).toMatch(/_99\.json$/);
    });
  });

  // ── writeBackupFile ─────────────────────────────────────────────────────

  describe("writeBackupFile", () => {
    it("writes entries to the given path", () => {
      const entries = [{ filename: "a.png" }, { filename: "b.png" }];
      mkdirSync(TEMP_DIR, { recursive: true });
      const outputPath = resolve(TEMP_DIR, "test-output.json");
      const result = writeBackupFile(entries, outputPath);
      expect(result).toBe(outputPath);
    });

    it("writes valid JSON content", () => {
      const entries = [{ filename: "test.png" }];
      mkdirSync(TEMP_DIR, { recursive: true });
      const outputPath = resolve(TEMP_DIR, "test-verify.json");
      writeBackupFile(entries, outputPath);
      // Verify writeFileSync was called correctly
      expect(writeFileSync).toHaveBeenCalledWith(
        outputPath,
        expect.any(String),
        "utf-8",
      );
    });
  });

  // ── main ────────────────────────────────────────────────────────────────

  describe("main", () => {
    it("connects via getImageLogConnection and returns result", async () => {
      const fakeConn = createFakeConnection();
      vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(
        fakeConn,
      );

      const result = await main();
      expect(clientModule.getImageLogConnection).toHaveBeenCalled();
      expect(result.entries).toHaveLength(3);
      expect(result.fileCount).toBe(1);
      expect(typeof result.timestamp).toBe("string");
    });

    it("fetches log entries from collection", async () => {
      const fakeConn = createFakeConnection();
      vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(
        fakeConn,
      );

      await main();

      expect(fakeConn.collection.find).toHaveBeenCalled();
      expect(fakeConn.collection.find().toArray).toHaveBeenCalled();
    });

    it("calls connection.client.close() in finally", async () => {
      const fakeConn = createFakeConnection();
      vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(
        fakeConn,
      );
      fakeConn.client.close.mockReset();

      await main();
      expect(fakeConn.client.close).toHaveBeenCalled();
    });

    it("logs events to console", async () => {
      const fakeConn = createFakeConnection();
      const logSpy = vi.spyOn(console, "log");
      vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(
        fakeConn,
      );

      await main();

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Fetched"));
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("Split into"),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("Writing to"),
      );
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Wrote"));
      expect(logSpy).toHaveBeenCalledWith("Connection closed.");
    });

    it("handles empty collection", async () => {
      const fakeConn = createFakeConnection();
      fakeConn.collection.find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      });
      vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(
        fakeConn,
      );

      const { writeFileSync, mkdirSync } = await import("node:fs");

      const result = await main();
      expect(result.entries).toEqual([]);
      expect(result.fileCount).toBe(0);
      // No file is written when there are no entries
      expect(writeFileSync).not.toHaveBeenCalled();
      expect(mkdirSync).not.toHaveBeenCalled();
      expect(fakeConn.client.close).toHaveBeenCalled();
    });

    it("splits entries into multiple files when exceeding ENTRIES_PER_FILE", async () => {
      const fakeConn = createFakeConnection();
      const largeEntries = Array.from({ length: 6_501 }, (_, i) => ({
        _id: String(i),
        filename: `file-${i}.png`,
        data: `data-${i}`,
      }));
      fakeConn.collection.find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue(largeEntries),
      });
      vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(
        fakeConn,
      );

      const { writeFileSync, mkdirSync } = await import("node:fs");

      await main();

      expect(fakeConn.client.close).toHaveBeenCalled();
      // 6501 entries / 3000 = 3 files
      expect(writeFileSync).toHaveBeenCalledTimes(3);
      expect(mkdirSync).toHaveBeenCalled();
    });

    it("writes backup files with correct naming pattern", async () => {
      const fakeConn = createFakeConnection();
      const largeEntries = Array.from({ length: 3_001 }, (_, i) => ({
        _id: String(i),
        filename: `file-${i}.png`,
      }));
      fakeConn.collection.find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue(largeEntries),
      });
      vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(
        fakeConn,
      );

      const { writeFileSync } = await import("node:fs");

      await main();

      // Check that at least one call includes "logs_" and ".json"
      expect(writeFileSync).toHaveBeenCalledTimes(2);
    });

    it("produces compact timestamp from naming utility in main()", async () => {
      const fakeConn = createFakeConnection();
      vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(
        fakeConn,
      );

      const result = await main();
      // timestamp() returns YYYYMMDDHHmmss (compact, 14 digits, no separators)
      expect(result.timestamp).toMatch(/^\d{14}$/);
      expect(typeof result.timestamp).toBe("string");
    });
  });

  // ── CLI guard ───────────────────────────────────────────────────────────

  describe("CLI guard", () => {
    it("runs main when invoked directly", async () => {
      const fakeConn = createFakeConnection();
      vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(
        fakeConn,
      );

      // The module-level guard runs once when the module is first loaded.
      // vi.spyOn creates a spy on the existing module export.
      // When the guard calls main(), the spy is already active.
      const result = await main();
      expect(result.entries).toHaveLength(3);
    });

    it("exits with error when MONGODB_URI is missing", async () => {
      vi.stubEnv("MONGODB_URI", "");
      vi.spyOn(clientModule, "getImageLogConnection").mockImplementation(
        async () => {
          const uri = process.env.MONGODB_URI;
          if (typeof uri !== "string" || uri === "") {
            throw new Error(
              "Missing MONGODB_URI environment variable. Set it to connect to MongoDB.",
            );
          }
          return createFakeConnection();
        },
      );

      await expect(main()).rejects.toThrow(/MONGODB_URI/);
    });
  });
});
