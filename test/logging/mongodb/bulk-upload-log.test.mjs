import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

let tempDir;
let tempFile;

beforeEach(async () => {
  tempDir = await mkdtemp(resolve(tmpdir(), "bulk-upload-test-"));
  tempFile = resolve(tempDir, "test-input.json");
  await writeFile(tempFile, JSON.stringify([]), "utf-8");
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (tempFile) {
    try {
      await rm(tempFile, { force: true });
    } catch {
      /* ignore cleanup errors */
    }
  }
  if (tempDir) {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore cleanup errors */
    }
  }
});

// ── Module-level env stub (prevents real MongoDB connection) ────────────────
vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017");

// ── Import under test ───────────────────────────────────────────────────────
import {
  bulkUpload,
  main,
  parseArgs,
  readLogEntries,
} from "../../../logging/mongodb/bulk-upload-log.mjs";

// ── Import modules for spying ───────────────────────────────────────────────
import * as clientModule from "../../../logging/mongodb/client.mjs";
import * as uploadModule from "../../../logging/mongodb/upload-log.mjs";

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Create a fake connection object that mimics getImageLogConnection's return
 * value without creating a real MongoDB client.
 */
function createFakeConnection() {
  return {
    client: { close: vi.fn() },
    collection: {
      db: { databaseName: "test-db" },
      collectionName: "test-collection",
      insertMany: vi.fn().mockResolvedValue({ insertedCount: 2 }),
    },
  };
}

/**
 * Write a JSON file with the given entries to the temp dir path.
 */
function writeTempFile(entries) {
  writeFileSync(tempFile, JSON.stringify(entries), "utf-8");
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("bulk-upload-log", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── parseArgs ───────────────────────────────────────────────────────────

  describe("parseArgs", () => {
    it("returns comma-separated paths", () => {
      const saved = process.argv;
      try {
        process.argv = ["node", "bulk-upload-log.mjs", "a.json,b.json"];
        expect(parseArgs()).toEqual(["a.json", "b.json"]);
      } finally {
        process.argv = saved;
      }
    });

    it("returns multiple positional args", () => {
      const saved = process.argv;
      try {
        process.argv = ["node", "bulk-upload-log.mjs", "a.json", "b.json"];
        expect(parseArgs()).toEqual(["a.json", "b.json"]);
      } finally {
        process.argv = saved;
      }
    });

    it("handles mixed comma-separated and positional args", () => {
      const saved = process.argv;
      try {
        process.argv = [
          "node",
          "bulk-upload-log.mjs",
          "a.json,b.json",
          "c.json",
        ];
        expect(parseArgs()).toEqual(["a.json", "b.json", "c.json"]);
      } finally {
        process.argv = saved;
      }
    });

    it("filters empty strings from trailing commas", () => {
      const saved = process.argv;
      try {
        process.argv = ["node", "bulk-upload-log.mjs", "a.json,"];
        expect(parseArgs()).toEqual(["a.json"]);
      } finally {
        process.argv = saved;
      }
    });

    it("preserves paths with spaces", () => {
      const saved = process.argv;
      try {
        process.argv = [
          "node",
          "bulk-upload-log.mjs",
          "/my path/file.json,/another/file.json",
        ];
        expect(parseArgs()).toEqual([
          "/my path/file.json",
          "/another/file.json",
        ]);
      } finally {
        process.argv = saved;
      }
    });

    it("returns empty array when no args", () => {
      const saved = process.argv;
      const exitMock = vi.spyOn(process, "exit").mockImplementation(() => {});
      try {
        process.argv = ["node", "bulk-upload-log.mjs"];
        expect(parseArgs()).toEqual([]);
      } finally {
        process.argv = saved;
        exitMock.mockRestore();
      }
    });
  });

  // ── readLogEntries ──────────────────────────────────────────────────────

  describe("readLogEntries", () => {
    it("returns parsed array from a valid JSON file", () => {
      const entries = [{ filename: "a.png" }, { filename: "b.png" }];
      writeTempFile(entries);
      const result = readLogEntries(tempFile);
      expect(result).toEqual(entries);
    });

    it("throws TypeError for non-array JSON", () => {
      writeTempFile([{ filename: "a.png" }]);
      vi.spyOn(JSON, "parse").mockReturnValue({ filename: "a.png" });
      expect(() => readLogEntries(tempFile)).toThrow(/expected a JSON array/);
    });

    it("throws for missing files", () => {
      expect(() => readLogEntries("/nonexistent/path/file.json")).toThrow();
    });
  });

  // ── bulkUpload ──────────────────────────────────────────────────────────

  describe("bulkUpload", () => {
    it("batches entries correctly with default batch size", async () => {
      const fakeConn = createFakeConnection();
      const uploadLogSpy = vi.spyOn(uploadModule, "uploadLog");
      uploadLogSpy.mockImplementation(async (entries, conn) => {
        conn.collection.insertMany.mockResolvedValue({
          insertedCount: entries.length,
        });
        return { uploaded: entries.length };
      });

      const entries = Array.from({ length: 6_500 }, (_, i) => ({
        filename: `file-${i}.png`,
      }));
      const result = await bulkUpload(entries, fakeConn, 3_000);

      expect(result.uploaded).toBe(6_500);
      expect(uploadLogSpy).toHaveBeenCalledTimes(3);
      expect(uploadLogSpy.mock.calls[0][0]).toHaveLength(3_000);
      expect(uploadLogSpy.mock.calls[1][0]).toHaveLength(3_000);
      expect(uploadLogSpy.mock.calls[2][0]).toHaveLength(500);
    });

    it("returns the correct uploaded count", async () => {
      const fakeConn = createFakeConnection();
      const uploadLogSpy = vi.spyOn(uploadModule, "uploadLog");
      uploadLogSpy.mockImplementation(async (entries, conn) => {
        conn.collection.insertMany.mockResolvedValue({
          insertedCount: entries.length,
        });
        return { uploaded: entries.length };
      });

      const entries = [{ filename: "a.png" }, { filename: "b.png" }];
      const result = await bulkUpload(entries, fakeConn, 3_000);

      expect(result.uploaded).toBe(2);
    });

    it("handles empty entries array", async () => {
      const fakeConn = createFakeConnection();
      const uploadLogSpy = vi.spyOn(uploadModule, "uploadLog");
      uploadLogSpy.mockImplementation(async (entries, conn) => {
        conn.collection.insertMany.mockResolvedValue({
          insertedCount: entries.length,
        });
        return { uploaded: entries.length };
      });

      const result = await bulkUpload([], fakeConn, 3_000);
      expect(result.uploaded).toBe(0);
      expect(uploadLogSpy).not.toHaveBeenCalled();
    });

    it("calls connection.client.close() in finally", async () => {
      const fakeConn = createFakeConnection();
      vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(
        fakeConn,
      );
      vi.spyOn(uploadModule, "uploadLog").mockResolvedValue({ uploaded: 2 });

      const saved = process.argv;
      try {
        writeTempFile([{ filename: "a.png" }]);
        process.argv = ["node", "bulk-upload-log.mjs", tempFile];
        await main();
      } finally {
        process.argv = saved;
      }

      expect(fakeConn.client.close).toHaveBeenCalled();
    });

    it("calls uploadLog with batched entries", async () => {
      const fakeConn = createFakeConnection();
      fakeConn.collection.insertMany.mockResolvedValue({ insertedCount: 1 });
      const uploadLogSpy = vi.spyOn(uploadModule, "uploadLog");

      const entries = Array.from({ length: 7_000 }, (_, i) => ({
        filename: `file-${i}.png`,
      }));
      await bulkUpload(entries, fakeConn, 3_000);

      expect(uploadLogSpy).toHaveBeenCalledTimes(3);
    });
  });

  // ── main ────────────────────────────────────────────────────────────────

  describe("main", () => {
    it("connects via getImageLogConnection and uploads entries", async () => {
      const fakeConn = createFakeConnection();
      vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(
        fakeConn,
      );

      const uploadLogSpy = vi.spyOn(uploadModule, "uploadLog");
      uploadLogSpy.mockImplementation(async (entries, conn) => {
        conn.collection.insertMany.mockResolvedValue({
          insertedCount: entries.length,
        });
        return { uploaded: entries.length };
      });

      const saved = process.argv;
      try {
        writeTempFile([{ filename: "a.png" }, { filename: "b.png" }]);
        process.argv = ["node", "bulk-upload-log.mjs", tempFile];
        await main();
      } finally {
        process.argv = saved;
      }

      expect(clientModule.getImageLogConnection).toHaveBeenCalled();
      expect(uploadLogSpy).toHaveBeenCalled();
      expect(fakeConn.client.close).toHaveBeenCalled();
    });

    it("handles multiple input files", async () => {
      const fakeConn = createFakeConnection();
      vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(
        fakeConn,
      );

      const uploadLogSpy = vi.spyOn(uploadModule, "uploadLog");
      uploadLogSpy.mockImplementation(async (entries, conn) => {
        conn.collection.insertMany.mockResolvedValue({
          insertedCount: entries.length,
        });
        return { uploaded: entries.length };
      });

      const saved = process.argv;
      const file2 = resolve(tempDir, "test-input-2.json");
      await writeFile(file2, JSON.stringify([{ filename: "c.png" }]), "utf-8");
      try {
        writeTempFile([{ filename: "a.png" }]);
        process.argv = ["node", "bulk-upload-log.mjs", `${tempFile},${file2}`];
        await main();
      } finally {
        process.argv = saved;
      }

      expect(clientModule.getImageLogConnection).toHaveBeenCalled();
      expect(fakeConn.client.close).toHaveBeenCalled();
    });

    it("reports MONGODB_URI value when connecting", async () => {
      const fakeConn = createFakeConnection();
      const connectionSpy = vi
        .spyOn(clientModule, "getImageLogConnection")
        .mockResolvedValue(fakeConn);

      const saved = process.argv;
      try {
        process.argv = ["node", "bulk-upload-log.mjs", tempFile];
        await main();
      } finally {
        process.argv = saved;
      }

      expect(connectionSpy).toHaveBeenCalled();
    });

    it("uses default batch size of 3,000", async () => {
      const fakeConn = createFakeConnection();
      vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(
        fakeConn,
      );

      const uploadLogSpy = vi.spyOn(uploadModule, "uploadLog");
      uploadLogSpy.mockImplementation(async (entries, conn) => {
        conn.collection.insertMany.mockResolvedValue({
          insertedCount: entries.length,
        });
        return { uploaded: entries.length };
      });

      const entries = Array.from({ length: 6_001 }, (_, i) => ({
        filename: `file-${i}.png`,
      }));
      writeTempFile(entries);

      const saved = process.argv;
      try {
        process.argv = ["node", "bulk-upload-log.mjs", tempFile];
        await main();
      } finally {
        process.argv = saved;
      }

      // 6001 entries / 3000 batch = 3 batches
      expect(uploadLogSpy).toHaveBeenCalledTimes(3);
    });

    it("exits with error on missing env var", async () => {
      vi.stubEnv("MONGODB_URI", "");
      const connectionSpy = vi
        .spyOn(clientModule, "getImageLogConnection")
        .mockImplementation(async () => {
          const uri = process.env.MONGODB_URI;
          if (typeof uri !== "string" || uri === "") {
            throw new Error(
              "Missing MONGODB_URI environment variable. Set it to connect to MongoDB.",
            );
          }
          return createFakeConnection();
        });

      const saved = process.argv;
      try {
        process.argv = ["node", "bulk-upload-log.mjs", tempFile];
        // main() should fail when MONGODB_URI is empty
        await expect(main()).rejects.toThrow(/MONGODB_URI/);
      } finally {
        process.argv = saved;
      }

      expect(connectionSpy).toHaveBeenCalled();
    });

    it("logs context error to console.error when bulkUpload fails", async () => {
      const fakeConn = createFakeConnection();
      vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(
        fakeConn,
      );

      const uploadError = new Error("connection timeout");
      vi.spyOn(uploadModule, "uploadLog").mockRejectedValue(uploadError);

      const errorSpy = vi.spyOn(console, "error");

      const saved = process.argv;
      try {
        writeTempFile([{ filename: "a.png" }]);
        process.argv = ["node", "bulk-upload-log.mjs", tempFile];
        await expect(main()).rejects.toThrow("connection timeout");
      } finally {
        process.argv = saved;
      }

      expect(errorSpy).toHaveBeenCalledWith(
        "Error uploading 1 entry: connection timeout",
      );
      expect(fakeConn.client.close).toHaveBeenCalledTimes(1);
      errorSpy.mockRestore();
    });
  });
});
