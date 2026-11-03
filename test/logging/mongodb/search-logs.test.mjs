import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017");

import {
  searchLogs,
  buildQuery,
  escapeRegex,
} from "../../../logging/mongodb/search-logs.mjs";

// ── Helpers ──────────────────────────────────────────────────────────────────

function matchEntryToQuery(entry, condition) {
  // Handle $or conditions
  if (condition.$or && Array.isArray(condition.$or)) {
    return condition.$or.some((orCond) => matchEntryToQuery(entry, orCond));
  }

  // Check each key-value pair (excluding $or key)
  for (const [key, value] of Object.entries(condition)) {
    if (key === "$or") continue;

    if (value.$regex) {
      const entryValue = String(entry[key] ?? "");
      const options = value.$options || "";
      const flags = options.includes("i") ? "i" : "";
      const regex = new RegExp(value.$regex, flags);
      if (!regex.test(entryValue)) {
        return false;
      }
    }

    if (value.$elemMatch) {
      const arr = entry[key];
      if (!Array.isArray(arr)) {
        return false;
      }
      if (!arr.some((item) => matchEntryToQuery(item, value.$elemMatch))) {
        return false;
      }
    }
  }

  return true;
}

function matchesFilter(entry, query) {
  if (!query || !query.$and) {
    return true;
  }
  return query.$and.every((cond) => matchEntryToQuery(entry, cond));
}

function createFakeConnection(entries = []) {
  let filtered = entries;
  const findSpy = vi.fn().mockImplementation((query) => {
    if (query && query.$and) {
      filtered = entries.filter((entry) => matchesFilter(entry, query));
    } else {
      filtered = entries;
    }
    return {
      toArray: vi.fn().mockResolvedValue(filtered),
      limit: vi.fn(function (n) {
        // 0 and Infinity mean "no limit" — skip truncation
        if (
          typeof n === "number" &&
          !Number.isNaN(n) &&
          n !== Infinity &&
          n > 0
        ) {
          if (n < filtered.length) {
            filtered.length = n;
          }
        }
        return this;
      }),
    };
  });

  return {
    client: { close: vi.fn().mockResolvedValue(undefined) },
    collection: {
      db: { databaseName: "test-db" },
      collectionName: "test-collection",
      find: findSpy,
      findOne: vi.fn().mockResolvedValue(entries[0] || null),
    },
    findSpy,
  };
}

// ── Sample data ───────────────────────────────────────────────────────────────

const SAMPLE_FLAT_ENTRY = {
  _id: "507f1f77bcf86cd799439011",
  "base-workflow": "unholy",
  "output-folder": "sampler3",
  "filename-prefix": "rover-euler",
  sampler: "euler",
  scheduler: "normal",
  loras: [{ name: "XL-FRover(WuWa).safetensors", strength: 1.2 }],
  prompt: "unholy-aesthetic, masterpiece",
  "negative-prompt": "bad quality",
  model: "unet.safetensors",
  filename: "rover-euler_20261101141233",
  steps: 20,
};

const SAMPLE_FLAT_ENTRY_2 = {
  _id: "507f1f77bcf86cd799439012",
  "base-workflow": "anime",
  "output-folder": "sampler1",
  "filename-prefix": "viking-lcm",
  sampler: "lcm",
  scheduler: "kl_optimal",
  loras: [{ name: "anime-lora.safetensors", strength: 0.8 }],
  prompt: "anime-style, vibrant colors",
  "negative-prompt": "realistic, photo",
  model: "anime-model.safetensors",
  filename: "viking-lcm_20261101150000",
  steps: 30,
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("escapeRegex", () => {
  it("returns the same string for simple input", () => {
    expect(escapeRegex("hello")).toBe("hello");
  });

  it("escapes special regex characters", () => {
    expect(escapeRegex("a.b*c?d+e^f$g{h}i[j]k|l\\m")).toBe(
      "a\\.b\\*c\\?d\\+e\\^f\\$g\\{h\\}i\\[j\\]k\\|l\\\\m",
    );
  });

  it("handles empty string", () => {
    expect(escapeRegex("")).toBe("");
  });

  it("handles undefined as string", () => {
    expect(escapeRegex(undefined)).toBe("undefined");
  });
});

describe("buildQuery", () => {
  it("returns empty object for null filters", () => {
    expect(buildQuery(null)).toEqual({});
  });

  it("returns empty object for undefined filters", () => {
    expect(buildQuery(undefined)).toEqual({});
  });

  it("returns empty object for empty filters object", () => {
    expect(buildQuery({})).toEqual({});
  });

  it("returns empty object for null-valued filters", () => {
    expect(
      buildQuery({ workflow: null, prefix: undefined, lora: null }),
    ).toEqual({});
  });

  it("builds query for workflow (flat base-workflow)", () => {
    const query = buildQuery({ workflow: "unholy" });
    expect(query).toEqual({
      $and: [{ "base-workflow": { $regex: "unholy", $options: "i" } }],
    });
  });

  it("builds query for prefix (flat filename-prefix)", () => {
    const query = buildQuery({ prefix: "rove" });
    expect(query).toEqual({
      $and: [{ "filename-prefix": { $regex: "rove", $options: "i" } }],
    });
  });

  it("builds query for sampler", () => {
    const query = buildQuery({ sampler: "eul" });
    expect(query).toEqual({
      $and: [{ sampler: { $regex: "eul", $options: "i" } }],
    });
  });

  it("builds query for scheduler", () => {
    const query = buildQuery({ scheduler: "normal" });
    expect(query).toEqual({
      $and: [{ scheduler: { $regex: "normal", $options: "i" } }],
    });
  });

  it("builds query for model", () => {
    const query = buildQuery({ model: "unet" });
    expect(query).toEqual({
      $and: [{ model: { $regex: "unet", $options: "i" } }],
    });
  });

  it("builds query for outputFolder (flat output-folder)", () => {
    const query = buildQuery({ outputFolder: "sampler" });
    expect(query).toEqual({
      $and: [{ "output-folder": { $regex: "sampler", $options: "i" } }],
    });
  });

  it("builds query for lora (using $elemMatch)", () => {
    const query = buildQuery({ lora: "FRover" });
    expect(query).toEqual({
      $and: [
        {
          loras: {
            $elemMatch: {
              name: { $regex: "FRover", $options: "i" },
            },
          },
        },
      ],
    });
  });

  it("builds query for prompt (using $or on prompt OR negative-prompt)", () => {
    const query = buildQuery({ prompt: "unholy" });
    expect(query).toEqual({
      $and: [
        {
          $or: [
            { prompt: { $regex: "unholy", $options: "i" } },
            { "negative-prompt": { $regex: "unholy", $options: "i" } },
          ],
        },
      ],
    });
  });

  it("handles array-valued filter (AND logic within array)", () => {
    const query = buildQuery({ sampler: ["eul", "normal"] });
    expect(query).toEqual({
      $and: [
        { sampler: { $regex: "eul", $options: "i" } },
        { sampler: { $regex: "normal", $options: "i" } },
      ],
    });
  });

  it("handles array-valued lora filter", () => {
    const query = buildQuery({ lora: ["FRover", "XL"] });
    expect(query).toEqual({
      $and: [
        {
          loras: {
            $elemMatch: { name: { $regex: "FRover", $options: "i" } },
          },
        },
        {
          loras: {
            $elemMatch: { name: { $regex: "XL", $options: "i" } },
          },
        },
      ],
    });
  });

  it("handles array-valued prompt filter (all values must match via $or)", () => {
    const query = buildQuery({ prompt: ["unholy", "bad"] });
    expect(query).toEqual({
      $and: [
        {
          $or: [
            { prompt: { $regex: "unholy", $options: "i" } },
            { "negative-prompt": { $regex: "unholy", $options: "i" } },
          ],
        },
        {
          $or: [
            { prompt: { $regex: "bad", $options: "i" } },
            { "negative-prompt": { $regex: "bad", $options: "i" } },
          ],
        },
      ],
    });
  });

  it("combines multiple filters with outer $and", () => {
    const query = buildQuery({
      workflow: "unholy",
      sampler: "euler",
      model: "unet",
    });
    expect(query).toHaveProperty("$and");
    expect(query.$and).toHaveLength(3);
  });
});

describe("searchLogs", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns all entries when filters are empty", async () => {
    const fakeConn = createFakeConnection([
      SAMPLE_FLAT_ENTRY,
      SAMPLE_FLAT_ENTRY_2,
    ]);
    const result = await searchLogs({}, fakeConn, null);

    expect(result).toHaveLength(2);
    expect(fakeConn.findSpy).toHaveBeenCalledWith({});
  });

  it("returns all entries when no filters match all (empty query)", async () => {
    const fakeConn = createFakeConnection([
      SAMPLE_FLAT_ENTRY,
      SAMPLE_FLAT_ENTRY_2,
    ]);
    const result = await searchLogs(
      { workflow: "unholy", prefix: "rove" },
      fakeConn,
      null,
    );

    expect(result).toHaveLength(1);
    expect(result[0]["base-workflow"]).toBe("unholy");
    expect(result[0]["filename-prefix"]).toContain("rove");
  });

  it("matches single sampler filter — case-insensitive substring", async () => {
    const fakeConn = createFakeConnection([
      { ...SAMPLE_FLAT_ENTRY, sampler: "euler" },
      { ...SAMPLE_FLAT_ENTRY_2, sampler: "lcm" },
    ]);
    const result = await searchLogs({ sampler: "Eul" }, fakeConn, null);

    expect(result).toHaveLength(1);
    expect(result[0].sampler).toBe("euler");
    expect(fakeConn.findSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        $and: expect.arrayContaining([
          expect.objectContaining({
            sampler: { $regex: expect.any(String), $options: "i" },
          }),
        ]),
      }),
    );
  });

  it("matches multiple filters with AND logic", async () => {
    const fakeConn = createFakeConnection([
      { ...SAMPLE_FLAT_ENTRY, sampler: "euler" },
      { ...SAMPLE_FLAT_ENTRY_2, sampler: "lcm" },
    ]);
    const result = await searchLogs(
      { sampler: "eul", workflow: "unholy" },
      fakeConn,
      null,
    );

    expect(result).toHaveLength(1);
    expect(result[0].sampler).toBe("euler");
    expect(result[0]["base-workflow"]).toBe("unholy");
  });

  it("array-valued filter — all values must match (AND within array)", async () => {
    const fakeConn = createFakeConnection([
      { ...SAMPLE_FLAT_ENTRY, sampler: "eulnormal" },
      { ...SAMPLE_FLAT_ENTRY_2, sampler: "lcm" },
    ]);
    const result = await searchLogs(
      { sampler: ["eul", "normal"] },
      fakeConn,
      null,
    );

    expect(result).toHaveLength(1);
    expect(result[0].sampler).toBe("eulnormal");
  });

  it("lora filter — matches against loras[].name (case-insensitive)", async () => {
    const fakeConn = createFakeConnection([
      {
        ...SAMPLE_FLAT_ENTRY,
        loras: [{ name: "XL-FRover(WuWa).safetensors", strength: 1.2 }],
      },
      {
        ...SAMPLE_FLAT_ENTRY_2,
        loras: [{ name: "anime-lora.safetensors", strength: 0.8 }],
      },
    ]);
    const result = await searchLogs({ lora: "fROVER" }, fakeConn, null);

    expect(result).toHaveLength(1);
    expect(result[0].loras[0].name).toContain("FRover");
  });

  it("prompt filter — matches prompt OR negative-prompt", async () => {
    const entry1 = {
      ...SAMPLE_FLAT_ENTRY,
      prompt: "hello world",
      "negative-prompt": "bad quality",
    };
    const entry2 = {
      ...SAMPLE_FLAT_ENTRY_2,
      prompt: "anime-style",
      "negative-prompt": "realistic",
    };
    const fakeConn = createFakeConnection([entry1, entry2]);

    const result = await searchLogs({ prompt: "BAD" }, fakeConn, null);

    expect(result).toHaveLength(1);
    expect(result[0]["negative-prompt"]).toBe("bad quality");
  });

  it("workflow filter — substring match on base-workflow", async () => {
    const entry1 = { ...SAMPLE_FLAT_ENTRY, "base-workflow": "unholy-simple" };
    const entry2 = { ...SAMPLE_FLAT_ENTRY_2, "base-workflow": "anime-v2" };
    const fakeConn = createFakeConnection([entry1, entry2]);

    const result = await searchLogs({ workflow: "unholy" }, fakeConn, null);

    expect(result).toHaveLength(1);
    expect(result[0]["base-workflow"]).toBe("unholy-simple");
  });

  it("prefix filter — substring match on filename-prefix", async () => {
    const entry1 = { ...SAMPLE_FLAT_ENTRY, "filename-prefix": "rover-xl" };
    const entry2 = { ...SAMPLE_FLAT_ENTRY_2, "filename-prefix": "viking" };
    const fakeConn = createFakeConnection([entry1, entry2]);

    const result = await searchLogs({ prefix: "ROVER" }, fakeConn, null);

    expect(result).toHaveLength(1);
    expect(result[0]["filename-prefix"]).toBe("rover-xl");
  });

  it("outputFolder filter — substring match on output-folder", async () => {
    const entry1 = { ...SAMPLE_FLAT_ENTRY, "output-folder": "sampler3" };
    const entry2 = { ...SAMPLE_FLAT_ENTRY_2, "output-folder": "sampler1" };
    const fakeConn = createFakeConnection([entry1, entry2]);

    const result = await searchLogs(
      { outputFolder: "SAMPLER" },
      fakeConn,
      null,
    );

    expect(result).toHaveLength(2);
  });

  it("scheduler filter — substring match on scheduler", async () => {
    const entry1 = { ...SAMPLE_FLAT_ENTRY, scheduler: "normal" };
    const entry2 = { ...SAMPLE_FLAT_ENTRY_2, scheduler: "kl_optimal" };
    const fakeConn = createFakeConnection([entry1, entry2]);

    const result = await searchLogs({ scheduler: "KL_" }, fakeConn, null);

    expect(result).toHaveLength(1);
    expect(result[0].scheduler).toBe("kl_optimal");
  });

  it("model filter — substring match on model", async () => {
    const entry1 = { ...SAMPLE_FLAT_ENTRY, model: "unet.safetensors" };
    const entry2 = { ...SAMPLE_FLAT_ENTRY_2, model: "anime-model.safetensors" };
    const fakeConn = createFakeConnection([entry1, entry2]);

    const result = await searchLogs({ model: "ANIME" }, fakeConn, null);

    expect(result).toHaveLength(1);
    expect(result[0].model).toBe("anime-model.safetensors");
  });

  it("applies limit correctly", async () => {
    const fakeConn = createFakeConnection([
      { ...SAMPLE_FLAT_ENTRY },
      { ...SAMPLE_FLAT_ENTRY_2 },
    ]);
    const result = await searchLogs({}, fakeConn, 1);

    expect(result).toHaveLength(1);
  });

  it("returns cloned objects without _id", async () => {
    const fakeConn = createFakeConnection([SAMPLE_FLAT_ENTRY]);
    const result = await searchLogs({}, fakeConn, null);

    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty("_id");
    expect(result[0]).not.toBe(SAMPLE_FLAT_ENTRY);

    // Mutating the result should not affect the original
    result[0].extraProp = "added";
    expect(SAMPLE_FLAT_ENTRY).not.toHaveProperty("extraProp");
  });

  it("connection used correctly — calls find with built query", async () => {
    const fakeConn = createFakeConnection([SAMPLE_FLAT_ENTRY]);
    await searchLogs({ sampler: "euler" }, fakeConn, null);

    expect(fakeConn.findSpy).toHaveBeenCalled();
    const queryArg = fakeConn.findSpy.mock.calls[0][0];
    expect(queryArg).toHaveProperty("$and");
  });

  it("handles empty collection", async () => {
    const fakeConn = createFakeConnection([]);
    const result = await searchLogs({}, fakeConn, null);

    expect(result).toEqual([]);
    expect(fakeConn.findSpy).toHaveBeenCalled();
  });

  it("handles limit smaller than results", async () => {
    const fakeConn = createFakeConnection([
      { ...SAMPLE_FLAT_ENTRY },
      { ...SAMPLE_FLAT_ENTRY_2 },
    ]);
    const result = await searchLogs({}, fakeConn, 1);

    expect(result).toHaveLength(1);
  });

  it("handles limit larger than results", async () => {
    const fakeConn = createFakeConnection([{ ...SAMPLE_FLAT_ENTRY }]);
    const result = await searchLogs({}, fakeConn, 100);

    expect(result).toHaveLength(1);
  });

  it("truncates results in-place when limit applied", async () => {
    const entries = [
      { ...SAMPLE_FLAT_ENTRY },
      { ...SAMPLE_FLAT_ENTRY_2 },
      { ...SAMPLE_FLAT_ENTRY, _id: "extra" },
    ];
    const fakeConn = createFakeConnection(entries);
    const result = await searchLogs({}, fakeConn, 2);

    expect(result).toHaveLength(2);
    expect(entries.length).toBe(2); // in-place truncation
  });
});

describe("searchLogsWithConnection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns results correctly without needing to pass connection", async () => {
    const clientImport = await import("../../../logging/mongodb/client.mjs");
    const spy = vi
      .spyOn(clientImport, "getImageLogConnection")
      .mockResolvedValue(createFakeConnection([SAMPLE_FLAT_ENTRY]));
    const { searchLogsWithConnection } =
      await import("../../../logging/mongodb/search-logs.mjs");
    const result = await searchLogsWithConnection({}, null);

    expect(result).toHaveLength(1);
    expect(result[0]["base-workflow"]).toBe("unholy");
    expect(result[0]).not.toHaveProperty("_id");
    spy.mockRestore();
  });

  it("closes connection in finally block after use", async () => {
    const fakeConn = createFakeConnection([
      SAMPLE_FLAT_ENTRY,
      SAMPLE_FLAT_ENTRY_2,
    ]);
    const closeSpy = vi
      .spyOn(fakeConn.client, "close")
      .mockResolvedValue(undefined);
    const clientImport = await import("../../../logging/mongodb/client.mjs");
    const spy = vi
      .spyOn(clientImport, "getImageLogConnection")
      .mockResolvedValue(fakeConn);

    const { searchLogsWithConnection } =
      await import("../../../logging/mongodb/search-logs.mjs");

    await searchLogsWithConnection({}, null);

    expect(closeSpy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("works with filters", async () => {
    const fakeConn = createFakeConnection([
      { ...SAMPLE_FLAT_ENTRY, sampler: "euler" },
      { ...SAMPLE_FLAT_ENTRY_2, sampler: "lcm" },
    ]);
    const clientImport = await import("../../../logging/mongodb/client.mjs");
    const spy = vi
      .spyOn(clientImport, "getImageLogConnection")
      .mockResolvedValue(fakeConn);

    const { searchLogsWithConnection } =
      await import("../../../logging/mongodb/search-logs.mjs");

    const result = await searchLogsWithConnection({ sampler: "Eul" }, null);

    expect(result).toHaveLength(1);
    expect(result[0].sampler).toBe("euler");
    spy.mockRestore();
  });

  it("works with limit", async () => {
    const fakeConn = createFakeConnection([
      SAMPLE_FLAT_ENTRY,
      SAMPLE_FLAT_ENTRY_2,
    ]);
    const clientImport = await import("../../../logging/mongodb/client.mjs");
    const spy = vi
      .spyOn(clientImport, "getImageLogConnection")
      .mockResolvedValue(fakeConn);

    const { searchLogsWithConnection } =
      await import("../../../logging/mongodb/search-logs.mjs");

    const result = await searchLogsWithConnection({}, 1);

    expect(result).toHaveLength(1);
    spy.mockRestore();
  });

  it("handles connection close even when searchLogs throws", async () => {
    const fakeConn = {
      client: {
        close: vi.fn().mockResolvedValue(undefined),
      },
      collection: {
        find: vi.fn().mockReturnValue({
          toArray: vi.fn().mockRejectedValue(new Error("db error")),
          limit: vi.fn().mockReturnThis(),
        }),
      },
    };
    const closeSpy = vi.spyOn(fakeConn.client, "close");
    const clientImport = await import("../../../logging/mongodb/client.mjs");
    const spy = vi
      .spyOn(clientImport, "getImageLogConnection")
      .mockResolvedValue(fakeConn);

    const { searchLogsWithConnection } =
      await import("../../../logging/mongodb/search-logs.mjs");

    await expect(searchLogsWithConnection({}, null)).rejects.toThrow(
      "db error",
    );
    expect(closeSpy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
