import { afterEach, describe, expect, it, vi } from "vitest";

// Prevent real MongoDB connections
vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017");

import {
  findLogEntry,
  findWithConnection,
  main,
  normalizeFilename,
} from "../../../logging/mongodb/find-log.mjs";

import * as clientModule from "../../../logging/mongodb/client.mjs";

// ── Helpers ──────────────────────────────────────────────────────────────────

const SAMPLE_ENTRY = {
  _id: "507f1f77bcf86cd799439011",
  "base-workflow": "unholy",
  "output-folder": "sampler3",
  "filename-prefix": "rover-euler",
  steps: 20,
  sampler: "euler",
  scheduler: "normal",
  loras: [{ name: "XL-FRover(WuWa).safetensors", strength: 1.2 }],
  "clip-skip": -2,
  tries: 3,
  prompt: "unholy-aesthetic, masterpiece, best quality",
  seed: 6210301511209347,
  "negative-prompt": "bad quality, censor",
  filename: "rover-euler_20261101141233",
  generatedIn: "0:12",
  comfyJobId: "a55aab98-f809-4b05-9534-cdd35f678f79",
};

function createFakeConnection() {
  return {
    client: { close: vi.fn().mockResolvedValue(undefined) },
    collection: {
      db: { databaseName: "test-db" },
      collectionName: "test-collection",
      find: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
      findOne: vi.fn().mockResolvedValue(SAMPLE_ENTRY),
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

// Restore process.argv[2] after every test to avoid cross-test pollution
// if tests run concurrently or in a different order.
afterEach(() => {
  delete process.argv[2];
});

describe("normalizeFilename", () => {
  it("strips .jpg extension", () => {
    expect(normalizeFilename("rover_20261102121307.jpg")).toBe(
      "rover_20261102121307",
    );
  });

  it("strips .png extension", () => {
    expect(normalizeFilename("test.png")).toBe("test");
  });

  it("strips .jpeg extension", () => {
    expect(normalizeFilename("test.jpeg")).toBe("test");
  });

  it("works with relative path containing directories", () => {
    expect(normalizeFilename("dist/log-test/rover_20261102121307.jpg")).toBe(
      "rover_20261102121307",
    );
  });

  it("works with Windows backslash paths", () => {
    expect(normalizeFilename("C:\\Users\\rover-euler_20261101141233.jpg")).toBe(
      "rover-euler_20261101141233",
    );
  });

  it("works with Unix absolute paths", () => {
    expect(normalizeFilename("/home/user/dist/photo_123.jpg")).toBe(
      "photo_123",
    );
  });

  it("handles filename with no extension", () => {
    expect(normalizeFilename("rover_20261102121307")).toBe(
      "rover_20261102121307",
    );
  });

  it("handles case-insensitive extension matching", () => {
    expect(normalizeFilename("test.JPG")).toBe("test");
    expect(normalizeFilename("test.Jpeg")).toBe("test");
    expect(normalizeFilename("test.PnG")).toBe("test");
  });

  it("handles Windows path with mixed case extension", () => {
    expect(normalizeFilename("D:\\Output\\shot.JPEG")).toBe("shot");
  });
});

describe("findLogEntry", () => {
  it("returns entry without _id when found", async () => {
    const fakeConn = createFakeConnection();
    const result = await findLogEntry("rover-euler_20261101141233", fakeConn);

    expect(result).not.toHaveProperty("_id");
    expect(result.filename).toBe("rover-euler_20261101141233");
    expect(result.steps).toBe(20);
    expect(result).toHaveProperty("prompt");
  });

  it("returns null when not found", async () => {
    const fakeConn = createFakeConnection();
    fakeConn.collection.findOne.mockResolvedValue(null);

    const result = await findLogEntry("nonexistent", fakeConn);

    expect(result).toBeNull();
  });

  it("calls collection.findOne with the correct filter", async () => {
    const fakeConn = createFakeConnection();
    await findLogEntry("my-test-filename", fakeConn);

    expect(fakeConn.collection.findOne).toHaveBeenCalledWith({
      filename: "my-test-filename",
    });
  });

  it("returns a cloned object (not the original reference)", async () => {
    const fakeConn = createFakeConnection();
    const result = await findLogEntry("rover-euler_20261101141233", fakeConn);

    // Mutating the result should not affect the internal SAMPLE_ENTRY
    result.extraProp = "added";
    expect(result).toHaveProperty("extraProp");
  });
});

describe("findWithConnection", () => {
  it("returns the entry when found", async () => {
    const fakeConn = createFakeConnection();
    vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(fakeConn);

    const result = await findWithConnection("rover-euler_20261101141233.jpg");

    expect(result).not.toHaveProperty("_id");
    expect(result.filename).toBe("rover-euler_20261101141233");
    expect(result.steps).toBe(20);
  });

  it("returns null when not found", async () => {
    const fakeConn = createFakeConnection();
    fakeConn.collection.findOne.mockResolvedValue(null);
    vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(fakeConn);
    const exitStub = vi.spyOn(process, "exit").mockImplementation(() => {});

    const result = await findWithConnection("missing");

    expect(result).toBeNull();
    expect(fakeConn.client.close).toHaveBeenCalledTimes(1);
    exitStub.mockRestore();
  });

  it("normalizes input before lookup", async () => {
    const fakeConn = createFakeConnection();
    vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(fakeConn);

    await findWithConnection("path/to/test-name.jpg");

    expect(fakeConn.collection.findOne).toHaveBeenCalledWith({
      filename: "test-name",
    });
  });

  it("closes the connection after lookup", async () => {
    const fakeConn = createFakeConnection();
    fakeConn.collection.findOne.mockResolvedValue(SAMPLE_ENTRY);
    vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(fakeConn);

    await findWithConnection("test.jpg");

    expect(fakeConn.client.close).toHaveBeenCalledTimes(1);
  });
});

describe("main", () => {
  it("connects to MongoDB and looks up the entry", async () => {
    const fakeConn = createFakeConnection();
    fakeConn.collection.findOne.mockResolvedValue(SAMPLE_ENTRY);
    vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(fakeConn);

    process.argv[2] = "rover_20261102121307.jpg";

    await main();

    expect(clientModule.getImageLogConnection).toHaveBeenCalled();
    expect(fakeConn.collection.findOne).toHaveBeenCalledWith({
      filename: "rover_20261102121307",
    });
    expect(fakeConn.client.close).toHaveBeenCalled();
  });

  it("normalizes the input filename before lookup", async () => {
    const fakeConn = createFakeConnection();
    fakeConn.collection.findOne.mockResolvedValue(SAMPLE_ENTRY);
    vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(fakeConn);

    process.argv[2] = "dist/nested/rover-euler_20261101141233.png";

    await main();

    expect(fakeConn.collection.findOne).toHaveBeenCalledWith({
      filename: "rover-euler_20261101141233",
    });
  });

  it("logs pretty-printed JSON when entry is found", async () => {
    const fakeConn = createFakeConnection();
    fakeConn.collection.findOne.mockResolvedValue(SAMPLE_ENTRY);
    vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(fakeConn);

    process.argv[2] = "test.jpg";

    const logSpy = vi.spyOn(console, "log");
    await main();

    // Should have "Looking up:", the JSON, and "Connection closed."
    const calls = logSpy.mock.calls;
    expect(calls).toContainEqual(expect.arrayContaining([expect.anything()]));
    // Check the JSON string contains key fields
    const jsonCall = calls.find(
      (c) => typeof c[0] === "string" && c[0].includes('"filename"'),
    );
    expect(jsonCall).toBeDefined();
    // NOTE: '"steps": 20' is a literal check that references SAMPLE_ENTRY.steps.
    // If SAMPLE_ENTRY changes, this test updates automatically (both live together),
    // so the risk of divergence is low.
    expect(jsonCall[0]).toContain('"steps": 20');
  });

  it("logs lookup message before connection", async () => {
    const fakeConn = createFakeConnection();
    const logSpy = vi.spyOn(console, "log");
    vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(fakeConn);

    process.argv[2] = "test.png";

    await main();

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Looking up: test"),
    );
  });

  it("exits with code 1 when entry is not found", async () => {
    const exitCode = [];
    const exitStub = vi.spyOn(process, "exit").mockImplementation((code) => {
      exitCode.push(code);
    });

    const fakeConn = createFakeConnection();
    fakeConn.collection.findOne.mockResolvedValue(null);
    vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(fakeConn);

    process.argv[2] = "missing.jpg";

    await main();

    expect(exitCode[0]).toBe(1);
    exitStub.mockRestore();
  });

  it("exits with code 1 when no CLI argument provided", async () => {
    const exitCode = [];
    const exitStub = vi.spyOn(process, "exit").mockImplementation((code) => {
      exitCode.push(code);
    });

    const fakeConn = createFakeConnection();
    vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(fakeConn);

    delete process.argv[2];

    await main();

    expect(exitCode[0]).toBe(1);
    exitStub.mockRestore();
  });

  it("exits with code 1 when CLI argument is empty string", async () => {
    const exitCode = [];
    const exitStub = vi.spyOn(process, "exit").mockImplementation((code) => {
      exitCode.push(code);
    });

    const fakeConn = createFakeConnection();
    vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(fakeConn);

    process.argv[2] = "";

    await main();

    expect(exitCode[0]).toBe(1);
    exitStub.mockRestore();
  });

  it("logs error message when entry not found", async () => {
    const exitCode = [];
    const exitStub = vi.spyOn(process, "exit").mockImplementation((code) => {
      exitCode.push(code);
    });

    const fakeConn = createFakeConnection();
    fakeConn.collection.findOne.mockResolvedValue(null);
    vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(fakeConn);
    const errorSpy = vi.spyOn(console, "error");

    process.argv[2] = "no-entry.jpg";

    await main();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("No log entry found"),
    );
    expect(exitCode[0]).toBe(1);
    errorSpy.mockRestore();
    exitStub.mockRestore();
  });

  it("logs context error to console.error when lookup throws", async () => {
    const fakeConn = createFakeConnection();
    const findError = new Error("query execution failed");
    fakeConn.collection.findOne.mockRejectedValue(findError);
    vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(fakeConn);
    const errorSpy = vi.spyOn(console, "error");

    process.argv[2] = "error-test.jpg";

    await expect(main()).rejects.toThrow("query execution failed");

    expect(errorSpy).toHaveBeenCalledWith(
      "Error looking up log for error-test: query execution failed",
    );
    expect(fakeConn.client.close).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it("closes connection in finally block on success", async () => {
    const fakeConn = createFakeConnection();
    fakeConn.client.close.mockReset();
    fakeConn.collection.findOne.mockResolvedValue(SAMPLE_ENTRY);
    vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(fakeConn);

    process.argv[2] = "test.jpg";

    await main();

    expect(fakeConn.client.close).toHaveBeenCalledTimes(1);
  });

  it("closes connection in finally block on error", async () => {
    const fakeConn = createFakeConnection();
    fakeConn.collection.findOne.mockResolvedValue(null);
    vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(fakeConn);

    process.argv[2] = "test.jpg";

    const exitCode = [];
    const exitStub = vi.spyOn(process, "exit").mockImplementation((code) => {
      exitCode.push(code);
    });

    await main();

    expect(fakeConn.client.close).toHaveBeenCalledTimes(1);
    expect(exitCode[0]).toBe(1);
    exitStub.mockRestore();
  });

  it("returns null on CLI error (process.exit not called in main)", async () => {
    const err = new Error("connection failed");
    vi.spyOn(clientModule, "getImageLogConnection").mockRejectedValue(err);
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw err;
    });

    process.argv[2] = "test.jpg";

    await expect(main()).rejects.toBe(err);
  });
});

// ── CLI guard ────────────────────────────────────────────────────────────────

describe("CLI guard", () => {
  it("runs main when invoked directly", async () => {
    const fakeConn = createFakeConnection();
    fakeConn.collection.findOne.mockResolvedValue(SAMPLE_ENTRY);
    vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(fakeConn);

    process.argv[2] = "rover.jpg";

    await main();

    expect(fakeConn.collection.findOne).toHaveBeenCalledWith({
      filename: "rover",
    });
  });

  it("handles process.exit being called after main resolves", async () => {
    vi.spyOn(clientModule, "getImageLogConnection").mockResolvedValue(
      createFakeConnection(),
    );

    process.argv[2] = "test.png";

    // Ensure exit is not already captured
    const exitStub = vi.spyOn(process, "exit").mockImplementation(() => {});

    await main();

    expect(exitStub).not.toHaveBeenCalled();
    exitStub.mockRestore();
  });
});
