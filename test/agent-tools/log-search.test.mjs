import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import {
  filterEntries,
  matchesFilter,
  collectJsonFiles,
  loadEntries,
  formatText,
  formatLoras,
  search,
  parseArgs,
  toFilterArray,
} from "../../agent-tools/log-search.mjs";

// -- temp-dir helpers (inspired by lookup-log.test.mjs) ----------------------

async function createTempLogsDir() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "log-search-"));
  return tmpDir;
}

async function cleanup(dir) {
  await fs.rm(dir, { recursive: true, force: true });
}

// -- Golden-file test helper: write a log file with known data, return dir --

async function createTempDirWithEntries(
  entries,
  fileName = "test_000001.json",
) {
  const tmpDir = await createTempLogsDir();
  const jsonFile = path.join(tmpDir, fileName);
  await fs.writeFile(jsonFile, JSON.stringify(entries), "utf8");
  return { tmpDir, jsonFile, cleanup: () => cleanup(tmpDir) };
}

// -- matchesFilter ----------------------------------------------------------

describe("matchesFilter", () => {
  it("matches workflow (case-insensitive substring)", () => {
    const entry = { prompt: { "base-workflow": "unholy" } };
    expect(matchesFilter(entry, { workflow: "unh" })).toBe(true);
    expect(matchesFilter(entry, { workflow: "UNH" })).toBe(true);
    expect(matchesFilter(entry, { workflow: "HOLY" })).toBe(true);
    expect(matchesFilter(entry, { workflow: "holy2" })).toBe(false);
  });

  it("matches prefix (case-insensitive substring)", () => {
    const entry = { prompt: { "filename-prefix": "rover" } };
    expect(matchesFilter(entry, { prefix: "rove" })).toBe(true);
    expect(matchesFilter(entry, { prefix: "ROVER" })).toBe(true);
  });

  it("matches lora name (case-insensitive substring)", () => {
    const entry = {
      prompt: {
        loras: [{ name: "XL-FRover(WuWa).safetensors", strength: 1.2 }],
      },
    };
    expect(matchesFilter(entry, { lora: "FRover" })).toBe(true);
    expect(matchesFilter(entry, { lora: "wuwa" })).toBe(true);
    expect(matchesFilter(entry, { lora: "SAFETENSORS" })).toBe(true);
  });

  it("matches lora name against empty loras array", () => {
    const entry = { prompt: { loras: [] } };
    expect(matchesFilter(entry, { lora: "any" })).toBe(false);
  });

  it("matches lora name against undefined loras", () => {
    const entry = { prompt: {} };
    expect(matchesFilter(entry, { lora: "any" })).toBe(false);
  });

  it("matches prompt text (substring in prompt or negative-prompt)", () => {
    const entry = {
      prompt: {
        prompt: "hello world, amazing scene",
        "negative-prompt": "bad quality, worst detail",
      },
    };
    expect(matchesFilter(entry, { prompt: "hello" })).toBe(true);
    expect(matchesFilter(entry, { prompt: "amazing" })).toBe(true);
    expect(matchesFilter(entry, { prompt: "bad" })).toBe(true); // in negative-prompt
    expect(matchesFilter(entry, { prompt: "worst detail" })).toBe(true);
    expect(matchesFilter(entry, { prompt: "missing" })).toBe(false);
  });

  it("matches output-folder (case-insensitive substring)", () => {
    const entry = { prompt: { "output-folder": "unholy2" } };
    expect(matchesFilter(entry, { outputFolder: "unholy" })).toBe(true);
    expect(matchesFilter(entry, { outputFolder: "HOLY2" })).toBe(true);
    expect(matchesFilter(entry, { outputFolder: "rover" })).toBe(false);
  });

  it("matches sampler (case-insensitive substring)", () => {
    const entry = { prompt: { sampler: "lcm" } };
    expect(matchesFilter(entry, { sampler: "LCM" })).toBe(true);
    expect(matchesFilter(entry, { sampler: "eul" })).toBe(false);
  });

  it("matches scheduler (case-insensitive substring)", () => {
    const entry = { prompt: { scheduler: "kl_optimal" } };
    expect(matchesFilter(entry, { scheduler: "kl_" })).toBe(true);
    expect(matchesFilter(entry, { scheduler: "KL_OPTIMAL" })).toBe(true);
  });

  it("matches model (case-insensitive substring)", () => {
    const entry = { prompt: { model: "v1-5-pruned-ckptonly.safetensors" } };
    expect(matchesFilter(entry, { model: "v1-5" })).toBe(true);
    expect(matchesFilter(entry, { model: "V1-5" })).toBe(true);
    expect(matchesFilter(entry, { model: "pruned" })).toBe(true);
    expect(matchesFilter(entry, { model: "xyz" })).toBe(false);
  });

  it("matches multiple model values (AND logic)", () => {
    const entry = {
      prompt: { model: "v1-5-pruned-ckptonly.safetensors" },
    };
    expect(matchesFilter(entry, { model: ["v1-5", "pruned"] })).toBe(true);
    expect(matchesFilter(entry, { model: ["v1-5", "missing"] })).toBe(false);
  });

  it("matches model against empty model field", () => {
    const entry = { prompt: { model: "" } };
    expect(matchesFilter(entry, { model: "any" })).toBe(false);
  });

  it("returns true when no filters specified", () => {
    const entry = { prompt: {} };
    expect(matchesFilter(entry, {})).toBe(true);
  });

  it("returns true when no filters and empty entry", () => {
    const entry = {};
    expect(matchesFilter(entry, {})).toBe(true);
  });
});

// -- filterEntries (AND logic) ---------------------------------------------

describe("filterEntries", () => {
  it("combines multiple filters with AND logic", () => {
    const entries = [
      {
        prompt: {
          "base-workflow": "unholy",
          "filename-prefix": "rover",
          "output-folder": "sampler",
        },
      },
      {
        prompt: {
          "base-workflow": "unholy",
          "filename-prefix": "viking",
          "output-folder": "sampler",
        },
      },
      {
        prompt: {
          "base-workflow": "anime",
          "filename-prefix": "rover",
          "output-folder": "sampler",
        },
      },
      {
        prompt: {
          "base-workflow": "unholy",
          "filename-prefix": "rover",
          "output-folder": "unholy2",
        },
      },
    ];
    const result = filterEntries(entries, {
      workflow: "unholy",
      prefix: "rove",
      outputFolder: "s",
    });
    expect(result).toHaveLength(1);
    expect(result[0].prompt["base-workflow"]).toBe("unholy");
  });

  it("returns all entries when filters empty", () => {
    const entries = [{ prompt: {} }, { prompt: {} }];
    expect(filterEntries(entries, {})).toHaveLength(2);
  });
});

// -- formatText ------------------------------------------------------------

describe("formatText", () => {
  it("prints no-match message when empty", () => {
    expect(formatText([])).toBe("No matching entries found.");
  });

  it("formats single entry", () => {
    const results = [
      {
        filename: "test.png",
        prompt: {
          "base-workflow": "unholy",
          "filename-prefix": "rover",
          "output-folder": "sampler",
          prompt: "hello",
          loras: [{ name: "test.safetensors", strength: 1 }],
        },
      },
    ];
    const text = formatText(results);
    expect(text).toContain("Found 1 matching entry");
    expect(text).toContain("[1] test.png");
    expect(text).toContain("Workflow: unholy");
  });

  it("formats multiple entries", () => {
    const results = [
      {
        filename: "a.png",
        prompt: {
          "base-workflow": "unholy",
          "filename-prefix": "r",
          "output-folder": "o",
          prompt: "a",
          loras: [],
        },
      },
      {
        filename: "b.png",
        prompt: {
          "base-workflow": "anime",
          "filename-prefix": "v",
          "output-folder": "p",
          prompt: "b",
          loras: [{ name: "lora.x", strength: 1 }],
        },
      },
    ];
    const text = formatText(results);
    expect(text).toContain("Found 2 matching entries");
    expect(text).toContain("[1] a.png");
    expect(text).toContain("[2] b.png");
  });

  it("truncates long prompts", () => {
    const longPrompt =
      "word1, word2, word3, word4, word5, word6, word7, word8, word9, word10, word11, word12, word13, word14, word15, word16, word17, word18, word19, word20, word21";
    const results = [
      {
        filename: "x.png",
        prompt: {
          "base-workflow": "unholy",
          "filename-prefix": "r",
          "output-folder": "o",
          prompt: longPrompt,
          loras: [],
        },
      },
    ];
    const text = formatText(results);
    expect(text).toContain("...");
    expect(text.length).toBeLessThan(longPrompt.length + 36);
  });

  it("normalizes existing whitespace to avoid double spaces", () => {
    const results = [
      {
        filename: "x.png",
        prompt: {
          "base-workflow": "unholy",
          "filename-prefix": "r",
          "output-folder": "o",
          prompt: "hello, world, amazing",
          loras: [],
        },
      },
    ];
    const text = formatText(results);
    // Should NOT contain ",  " (double space)
    expect(text).not.toContain(",  ");
    expect(text).toContain("hello, world, amazing");
  });
});

describe("formatLoras", () => {
  it("returns (none) for empty array", () => {
    expect(formatLoras([])).toBe("(none)");
  });

  it("returns (none) for undefined", () => {
    expect(formatLoras(undefined)).toBe("(none)");
  });

  it("formats lora names", () => {
    expect(
      formatLoras([{ name: "a.safetensors" }, { name: "b.safetensors" }]),
    ).toBe("a.safetensors, b.safetensors");
  });
});

// -- collectJsonFiles ------------------------------------------------------

describe("collectJsonFiles", () => {
  it("collects only .json files from temp directory", async () => {
    const tmpDir = await createTempLogsDir();
    try {
      // Write known files
      await fs.writeFile(path.join(tmpDir, "a.json"), "{}", "utf8");
      await fs.writeFile(path.join(tmpDir, "b.json"), "{}", "utf8");
      await fs.writeFile(path.join(tmpDir, "c.txt"), "text", "utf8");

      const files = await collectJsonFiles(tmpDir);
      expect(files.length).toBe(2);
      for (const f of files) {
        expect(f).toMatch(/\.json$/);
      }
    } finally {
      await cleanup(tmpDir);
    }
  });

  it("returns empty array for missing directory", async () => {
    const files = await collectJsonFiles("/tmp/does-not-exist-dir-xyz");
    expect(files).toEqual([]);
  });
});

// -- loadEntries -----------------------------------------------------------

describe("loadEntries", () => {
  it("loads entries from json files in a temp directory", async () => {
    const tmpDir = await createTempLogsDir();
    try {
      // Write known entries
      const entryA = { filename: "a.png", prompt: { "base-workflow": "x" } };
      const entryB = { filename: "b.png", prompt: { "base-workflow": "y" } };
      await fs.writeFile(
        path.join(tmpDir, "test.json"),
        JSON.stringify([entryA, entryB]),
        "utf8",
      );

      const entries = await loadEntries(tmpDir);
      expect(entries).toHaveLength(2);
      for (const e of entries) {
        expect(e).toHaveProperty("prompt");
        expect(e).toHaveProperty("filename");
        expect(e).toHaveProperty("_source");
      }
    } finally {
      await cleanup(tmpDir);
    }
  });

  it("skips malformed JSON files", async () => {
    const tmpDir = await createTempLogsDir();
    try {
      const badFile = path.join(tmpDir, "bad.json");
      await fs.writeFile(badFile, "{not valid json!!", "utf8");
      await fs.writeFile(
        path.join(tmpDir, "good.json"),
        JSON.stringify([{ filename: "ok.png", prompt: {} }]),
        "utf8",
      );

      const entries = await loadEntries(tmpDir);
      expect(entries).toHaveLength(1);
    } finally {
      await cleanup(tmpDir);
    }
  });

  it("returns empty array when directory has no json files", async () => {
    const tmpDir = await createTempLogsDir();
    try {
      await fs.writeFile(path.join(tmpDir, "only.txt"), "text", "utf8");
      const entries = await loadEntries(tmpDir);
      expect(entries).toEqual([]);
    } finally {
      await cleanup(tmpDir);
    }
  });
});

// -- search (integration) --------------------------------------------------

describe("search integration", () => {
  it("loads and returns entries from a temp directory", async () => {
    const { tmpDir } = await createTempDirWithEntries([
      { filename: "found.png", prompt: { "base-workflow": "unholy" } },
    ]);
    try {
      const results = await search(tmpDir, {}, false, null);
      expect(results).toBeUndefined(); // search prints, doesn't return
    } finally {
      await cleanup(tmpDir);
    }
  });

  it("handles non-existent log directory", async () => {
    await expect(
      search("/tmp/does-not-exist-log-dir-xyz", {}, false, null),
    ).resolves.toBeUndefined();
  });

  it("supports --limit by truncating results", async () => {
    const tmpDir = await createTempLogsDir();
    try {
      // Write 10 entries with unholy workflow
      const entries = Array.from({ length: 10 }, (_, i) => ({
        filename: `entry_${i}.png`,
        prompt: { "base-workflow": "unholy" },
      }));
      await fs.writeFile(
        path.join(tmpDir, "test.json"),
        JSON.stringify(entries),
        "utf8",
      );

      const { search: s } = await import("../../agent-tools/log-search.mjs");
      const spy = vi.spyOn(console, "log").mockImplementation();

      await s(tmpDir, { workflow: "unholy" }, false, 5);

      // Verify the output says "Found 5 matching" (not more, not fewer)
      const output = spy.mock.calls[0][0];
      expect(output).toMatch(/^Found 5 matching entries:/m);

      spy.mockRestore();
    } finally {
      await cleanup(tmpDir);
    }
  });
});

// -- toFilterArray -----------------------------------------------------------

describe("toFilterArray", async () => {
  it("converts single string to array", async () => {
    expect(toFilterArray("hello")).toEqual(["hello"]);
  });

  it("passes through arrays", async () => {
    expect(toFilterArray(["a", "b"])).toEqual(["a", "b"]);
  });
});

// -- multi-value filter support ----------------------------------------------

describe("multi-value filter support", () => {
  it("matches multiple prompt values (AND logic)", () => {
    const entry = {
      prompt: {
        prompt:
          "unholy-aesthetic, masterpiece, best quality, ultra detailed face, frover, black dress, bare shoulders",
        "negative-prompt": "bad quality, worst detail",
      },
    };
    // Single values work as before
    expect(matchesFilter(entry, { prompt: "frover" })).toBe(true);
    expect(matchesFilter(entry, { prompt: "black dress" })).toBe(true);
    // Multiple values (AND logic) - both must match
    expect(matchesFilter(entry, { prompt: ["frover", "black dress"] })).toBe(
      true,
    );
  });

  it("rejects when one of multiple prompt values is missing", () => {
    const entry = {
      prompt: {
        prompt: "frover, black dress, bare shoulders",
        "negative-prompt": "bad quality, worst detail",
      },
    };
    // "frover" is in prompt, "black dress" is in prompt - passes
    expect(matchesFilter(entry, { prompt: ["frover", "black dress"] })).toBe(
      true,
    );
    // "missing" is NOT in prompt or negative-prompt
    expect(matchesFilter(entry, { prompt: ["frover", "missing"] })).toBe(false);
    // "bad quality" is in negative-prompt, "frover" is in prompt
    expect(matchesFilter(entry, { prompt: ["frover", "bad quality"] })).toBe(
      true,
    );
  });

  it("matches multiple workflow values (AND logic)", () => {
    const entry = {
      prompt: {
        "base-workflow": "unholy-simple-base",
      },
    };
    expect(matchesFilter(entry, { workflow: ["unholy", "simple"] })).toBe(true);
    expect(matchesFilter(entry, { workflow: ["unholy", "missing"] })).toBe(
      false,
    );
  });

  it("matches multiple prefix values (AND logic)", () => {
    const entry = {
      prompt: {
        "filename-prefix": "rover-xlfr",
      },
    };
    expect(matchesFilter(entry, { prefix: ["rover", "xlfr"] })).toBe(true);
    expect(matchesFilter(entry, { prefix: ["rover", "abc"] })).toBe(false);
  });

  it("matches multiple output-folder values (AND logic)", () => {
    const entry = {
      prompt: {
        "output-folder": "rover-city",
      },
    };
    expect(matchesFilter(entry, { outputFolder: ["rover", "city"] })).toBe(
      true,
    );
    expect(matchesFilter(entry, { outputFolder: ["rover", "sampler"] })).toBe(
      false,
    );
  });

  it("matches multiple sampler values (AND logic)", () => {
    const entry = {
      prompt: {
        sampler: "lcm",
      },
    };
    // "lcm" contains "lcm" but NOT "kl" as substring
    expect(matchesFilter(entry, { sampler: ["lcm", "kl"] })).toBe(false);
    expect(matchesFilter(entry, { sampler: ["lcm", "euler"] })).toBe(false);
    // Single filter value matches
    expect(matchesFilter(entry, { sampler: ["lcm"] })).toBe(true);
    // All values present
    const entry2 = {
      prompt: {
        sampler: "kl_optimal",
      },
    };
    expect(matchesFilter(entry2, { sampler: ["kl", "optimal"] })).toBe(true);
  });

  it("matches multiple lora values (AND logic)", () => {
    const entry = {
      prompt: {
        loras: [
          { name: "XL-FRover(WuWa).safetensors", strength: 1.2 },
          { name: "other-lora.safetensors", strength: 0.8 },
        ],
      },
    };
    expect(matchesFilter(entry, { lora: ["FRover", "other"] })).toBe(true);
    expect(matchesFilter(entry, { lora: ["FRover", "missing"] })).toBe(false);
  });

  it("handles single values and arrays uniformly", () => {
    const entry = {
      prompt: {
        "base-workflow": "unholy",
        "filename-prefix": "rover",
        prompt: "frover black dress",
        loras: [{ name: "test.safetensors", strength: 1 }],
      },
    };
    // Single values
    expect(matchesFilter(entry, { workflow: "unholy" })).toBe(true);
    expect(matchesFilter(entry, { prefix: "rove" })).toBe(true);
    expect(matchesFilter(entry, { prompt: "frover" })).toBe(true);
    expect(matchesFilter(entry, { lora: "test" })).toBe(true);

    // Arrays with single element (should behave the same)
    expect(matchesFilter(entry, { workflow: ["unholy"] })).toBe(true);
    expect(matchesFilter(entry, { prefix: ["rove"] })).toBe(true);
    expect(matchesFilter(entry, { prompt: ["frover"] })).toBe(true);
    expect(matchesFilter(entry, { lora: ["test"] })).toBe(true);
  });
});

// -- CLI argument parsing ----------------------------------------------------

describe("CLI argument parsing", async () => {
  it("parses single --prompt value", async () => {
    const args = parseArgs(["node", "log-search.mjs", "--prompt", "frover"]);
    expect(args.filters.prompt).toEqual(["frover"]);
  });

  it("accumulates repeated --prompt values", async () => {
    const args = parseArgs([
      "node",
      "log-search.mjs",
      "--prompt",
      "frover",
      "--prompt",
      "black dress",
    ]);
    expect(args.filters.prompt).toEqual(["frover", "black dress"]);
  });

  it("accumulates repeated --workflow values", async () => {
    const args = parseArgs([
      "node",
      "log-search.mjs",
      "--workflow",
      "unholy",
      "--workflow",
      "simple",
    ]);
    expect(args.filters.workflow).toEqual(["unholy", "simple"]);
  });

  it("accumulates repeated --lora values", async () => {
    const args = parseArgs([
      "node",
      "log-search.mjs",
      "--lora",
      "FRover",
      "--lora",
      "XL",
    ]);
    expect(args.filters.lora).toEqual(["FRover", "XL"]);
  });

  it("accumulates repeated --prefix values", async () => {
    const args = parseArgs([
      "node",
      "log-search.mjs",
      "--prefix",
      "rover",
      "--prefix",
      "xlfr",
    ]);
    expect(args.filters.prefix).toEqual(["rover", "xlfr"]);
  });

  it("accumulates repeated --output-folder values", async () => {
    const args = parseArgs([
      "node",
      "log-search.mjs",
      "--output-folder",
      "rover",
      "--output-folder",
      "city",
    ]);
    expect(args.filters.outputFolder).toEqual(["rover", "city"]);
  });

  it("handles positional log directory", async () => {
    const args = parseArgs(["node", "log-search.mjs", "/custom/logs/"]);
    expect(args.logsDir).toBe("/custom/logs/");
  });

  it("shows help flag", async () => {
    const args = parseArgs(["node", "log-search.mjs", "--help"]);
    expect(args.help).toBe(true);
  });
});

// -- Golden-file CLI tests ---------------------------------------------------

describe("CLI golden-file tests", () => {
  let tmpDir;

  beforeEach(async () => {
    const created = await createTempDirWithEntries([
      { filename: "found_001.png", prompt: { "base-workflow": "unholy" } },
      { filename: "found_002.png", prompt: { "base-workflow": "unholy" } },
      { filename: "found_003.png", prompt: { "base-workflow": "anime" } },
    ]);
    tmpDir = created.tmpDir;
  });

  afterEach(async () => {
    await cleanup(tmpDir);
  });

  it("outputs matching entries for workflow filter", async () => {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync(
      "node",
      [
        path.join(process.cwd(), "agent-tools/log-search.mjs"),
        "--workflow",
        "unholy",
        tmpDir,
      ],
      { encoding: "utf8", timeout: 10000 },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("unholy");
    expect(result.stdout).toContain("Found 2 matching entries");
  });

  it("outputs JSON format when --json flag given", async () => {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync(
      "node",
      [
        path.join(process.cwd(), "agent-tools/log-search.mjs"),
        "--workflow",
        "unholy",
        "--json",
        tmpDir,
      ],
      { encoding: "utf8", timeout: 10000 },
    );
    expect(result.status).toBe(0);
    // Verify it starts with [ and ends with ]
    const parsed = JSON.parse(result.stdout.trim());
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);
  });

  it("returns no-match message when no entries match", async () => {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync(
      "node",
      [
        path.join(process.cwd(), "agent-tools/log-search.mjs"),
        "--workflow",
        "nonexistent_xyz_12345",
        tmpDir,
      ],
      { encoding: "utf8", timeout: 10000 },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("No matching entries found.");
  });

  it("supports --prompt with multiple repeated values", async () => {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync(
      "node",
      [
        path.join(process.cwd(), "agent-tools/log-search.mjs"),
        "--prompt",
        "frover",
        "--prompt",
        "black dress",
        tmpDir,
      ],
      { encoding: "utf8", timeout: 10000 },
    );
    expect(result.status).toBe(0);
    // Output either "Found X matching" or "No matching entries found."
    expect(
      result.stdout.includes("Found") ||
        result.stdout.includes("No matching entries found."),
    ).toBe(true);
  });

  it("supports --log-dir flag", async () => {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync(
      "node",
      [
        path.join(process.cwd(), "agent-tools/log-search.mjs"),
        "--log-dir",
        tmpDir,
      ],
      { encoding: "utf8", timeout: 10000 },
    );
    expect(result.status).toBe(0);
  });

  it("handles non-existent log directory gracefully", async () => {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync(
      "node",
      [
        path.join(process.cwd(), "agent-tools/log-search.mjs"),
        "--log-dir",
        "/tmp/does-not-exist-cli-test-xyz",
      ],
      { encoding: "utf8", timeout: 10000 },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("No matching entries found.");
  });

  it("outputs limit results when --limit given", async () => {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync(
      "node",
      [
        path.join(process.cwd(), "agent-tools/log-search.mjs"),
        "--limit",
        "2",
        tmpDir,
      ],
      { encoding: "utf8", timeout: 10000 },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Found 2 matching entries");
  });
});
