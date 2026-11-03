import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadLog } from "../../../logging/mongodb/upload-log.mjs";

afterEach(() => {
  vi.restoreAllMocks();
});

function createMockConnection({
  insertManyResult = { insertedCount: 3 },
  closePromise = Promise.resolve(),
} = {}) {
  const collection = {
    insertMany: vi.fn(async () => insertManyResult),
  };
  const client = {
    close: vi.fn(() => closePromise),
  };
  return { client, collection };
}

function buildEntry(filename) {
  return {
    prompt: { prompt: "a cat" },
    filename,
    outputPath: "output",
    generatedIn: "0:24",
    comfyJobId: "job-1",
  };
}

describe("upload-log (MongoDB)", () => {
  it("returns uploaded count equal to inserted documents", async () => {
    const connection = createMockConnection({
      insertManyResult: { insertedCount: 5 },
    });
    const entries = [
      buildEntry("a.png"),
      buildEntry("b.png"),
      buildEntry("c.png"),
    ];
    const result = await uploadLog(entries, connection);
    expect(result).toEqual({ uploaded: 5 });
  });

  it("passes documents to collection.insertMany with { ordered: true }", async () => {
    const connection = createMockConnection();
    const entries = [
      { prompt: { prompt: "a" }, filename: "a.png" },
      { prompt: { prompt: "b" }, filename: "b.png" },
    ];
    await uploadLog(entries, connection);
    expect(connection.collection.insertMany).toHaveBeenCalledTimes(1);
    expect(connection.collection.insertMany.mock.calls[0][1]).toEqual({
      ordered: true,
    });
  });

  it("strips extensions from filenames before inserting", async () => {
    const connection = createMockConnection();
    const entries = [buildEntry("bp-cp_20261005233501.png")];
    await uploadLog(entries, connection);
    const documents = connection.collection.insertMany.mock.calls[0][0];
    expect(documents[0].filename).toBe("bp-cp_20261005233501");
  });

  it("strips extension for nested and Windows paths", async () => {
    const connection = createMockConnection();
    const entries = [
      buildEntry("dist/nested/photo.jpg"),
      buildEntry("C:\\output\\shot.jpeg"),
      buildEntry("archive.tar.gz"),
    ];
    await uploadLog(entries, connection);
    const documents = connection.collection.insertMany.mock.calls[0][0];
    expect(documents[0].filename).toBe("photo");
    expect(documents[1].filename).toBe("shot");
    expect(documents[2].filename).toBe("archive.tar");
  });

  it("spreads log entry properties alongside stripped filename", async () => {
    const connection = createMockConnection();
    const originalEntry = buildEntry("test.png");
    await uploadLog([originalEntry], connection);
    const documents = connection.collection.insertMany.mock.calls[0][0];
    expect(documents[0]).toHaveProperty("prompt", originalEntry.prompt);
    expect(documents[0]).toHaveProperty("outputPath", originalEntry.outputPath);
    expect(documents[0]).toHaveProperty(
      "generatedIn",
      originalEntry.generatedIn,
    );
    expect(documents[0]).toHaveProperty("comfyJobId", originalEntry.comfyJobId);
    expect(documents[0].filename).toBe("test");
  });

  it("insertedCount becomes the uploaded value", async () => {
    const connection = createMockConnection({
      insertManyResult: { insertedCount: 0 },
    });
    const result = await uploadLog([buildEntry("a.png")], connection);
    expect(result.uploaded).toBe(0);
  });

  it("throws TypeError when logEntries is not an array", async () => {
    const connection = createMockConnection();
    await expect(uploadLog(null, connection)).rejects.toThrow(
      "uploadLog expects an array of log entries.",
    );
    await expect(uploadLog("string", connection)).rejects.toThrow(
      "uploadLog expects an array of log entries.",
    );
    expect(connection.collection.insertMany).not.toHaveBeenCalled();
  });

  it("skips entries with missing filename", async () => {
    const connection = createMockConnection({
      insertManyResult: { insertedCount: 1 },
    });
    await uploadLog([null, {}, buildEntry("ok.png")], connection);
    expect(connection.collection.insertMany).toHaveBeenCalledTimes(1);
    const documents = connection.collection.insertMany.mock.calls[0][0];
    expect(documents).toHaveLength(1);
    expect(documents[0].filename).toBe("ok");
  });

  it("skips entries with empty filename string", async () => {
    const connection = createMockConnection({
      insertManyResult: { insertedCount: 1 },
    });
    await uploadLog(
      [{ filename: "" }, { filename: "/" }, buildEntry("ok.png")],
      connection,
    );
    expect(connection.collection.insertMany).toHaveBeenCalledTimes(1);
    const documents = connection.collection.insertMany.mock.calls[0][0];
    expect(documents).toHaveLength(1);
  });

  it("returns uploaded: 0 for an empty batch", async () => {
    const connection = createMockConnection({
      insertManyResult: { insertedCount: 0 },
    });
    const result = await uploadLog([], connection);
    expect(result).toEqual({ uploaded: 0 });
    expect(connection.collection.insertMany).toHaveBeenCalledTimes(1);
  });

  it("passes an empty array to insertMany when all entries are filtered", async () => {
    const connection = createMockConnection({
      insertManyResult: { insertedCount: 0 },
    });
    await uploadLog([{ filename: "" }, null, {}], connection);
    const documents = connection.collection.insertMany.mock.calls[0][0];
    expect(documents).toHaveLength(0);
  });

  it("calls client.close() on insertMany error", async () => {
    const connection = createMockConnection({
      insertManyResult: { insertedCount: 0 },
    });
    const errorMessage = "insert failed";
    connection.collection.insertMany = vi.fn(async () => {
      throw new Error(errorMessage);
    });

    await expect(uploadLog([buildEntry("a.png")], connection)).rejects.toThrow(
      errorMessage,
    );

    expect(connection.client.close).toHaveBeenCalledTimes(1);
  });

  it("re-throws the original error after closing client", async () => {
    const connection = createMockConnection();
    const customError = new Error("custom mongo error");
    connection.collection.insertMany = vi.fn(async () => {
      throw customError;
    });

    await expect(uploadLog([buildEntry("a.png")], connection)).rejects.toBe(
      customError,
    );
  });

  it("handles entries with dotfile-style names that pass through unchanged", async () => {
    const connection = createMockConnection();
    const entries = [buildEntry(".hidden"), buildEntry("noext")];
    await uploadLog(entries, connection);
    const documents = connection.collection.insertMany.mock.calls[0][0];
    expect(documents[0].filename).toBe(".hidden");
    expect(documents[1].filename).toBe("noext");
  });

  it("handles undefined filename gracefully", async () => {
    const connection = createMockConnection({
      insertManyResult: { insertedCount: 1 },
    });
    await uploadLog(
      [{ filename: undefined }, buildEntry("ok.png")],
      connection,
    );
    const documents = connection.collection.insertMany.mock.calls[0][0];
    expect(documents).toHaveLength(1);
  });
});
