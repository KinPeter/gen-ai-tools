import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock searchLogsWithConnection so the real MongoDB connection is never used.
vi.mock("../../logging/mongodb/search-logs.mjs", () => ({
  searchLogsWithConnection: vi.fn(),
}));

import { searchLogsWithConnection } from "../../logging/mongodb/search-logs.mjs";
import {
  parseArgs,
  formatLoras,
  formatText,
  search,
  runCLI,
  printHelp,
} from "../../agent-tools/log-search.mjs";

// -- parseArgs ---------------------------------------------------------------

describe("parseArgs", () => {
  it("returns empty filters when no flags provided", () => {
    const result = parseArgs(["node", "script.mjs"]);
    expect(result.filters).toEqual({});
    expect(result.json).toBe(false);
    expect(result.limit).toBeNull();
  });

  it("parses --workflow flag", () => {
    const result = parseArgs(["node", "script.mjs", "--workflow", "sdxl"]);
    expect(result.filters.workflow).toEqual(["sdxl"]);
  });

  it("parses --prefix flag", () => {
    const result = parseArgs(["node", "script.mjs", "--prefix", "test"]);
    expect(result.filters.prefix).toEqual(["test"]);
  });

  it("parses --lora flag", () => {
    const result = parseArgs(["node", "script.mjs", "--lora", "loraname"]);
    expect(result.filters.lora).toEqual(["loraname"]);
  });

  it("parses --prompt flag", () => {
    const result = parseArgs(["node", "script.mjs", "--prompt", "a cat"]);
    expect(result.filters.prompt).toEqual(["a cat"]);
  });

  it("parses --output-folder flag", () => {
    const result = parseArgs([
      "node",
      "script.mjs",
      "--output-folder",
      "wallpaper",
    ]);
    expect(result.filters.outputFolder).toEqual(["wallpaper"]);
  });

  it("parses --sampler flag", () => {
    const result = parseArgs(["node", "script.mjs", "--sampler", "euler"]);
    expect(result.filters.sampler).toEqual(["euler"]);
  });

  it("parses --scheduler flag", () => {
    const result = parseArgs(["node", "script.mjs", "--scheduler", "ddim"]);
    expect(result.filters.scheduler).toEqual(["ddim"]);
  });

  it("parses --model flag", () => {
    const result = parseArgs(["node", "script.mjs", "--model", "sdxl"]);
    expect(result.filters.model).toEqual(["sdxl"]);
  });

  it("accumulates repeated --prompt into array", () => {
    const result = parseArgs([
      "node",
      "script.mjs",
      "--prompt",
      "first",
      "--prompt",
      "second",
    ]);
    expect(result.filters.prompt).toEqual(["first", "second"]);
  });

  it("accumulates repeated --model into array", () => {
    const result = parseArgs([
      "node",
      "script.mjs",
      "--model",
      "a",
      "--model",
      "b",
    ]);
    expect(result.filters.model).toEqual(["a", "b"]);
  });

  it("sets json to true when --json flag present", () => {
    const result = parseArgs(["node", "script.mjs", "--json"]);
    expect(result.json).toBe(true);
  });

  it("parses --limit with integer value", () => {
    const result = parseArgs(["node", "script.mjs", "--limit", "42"]);
    expect(result.limit).toBe(42);
  });

  it("sets help to true when --help flag present", () => {
    const result = parseArgs(["node", "script.mjs", "--help"]);
    expect(result.help).toBe(true);
  });

  it("parses multiple different flags together", () => {
    const result = parseArgs([
      "node",
      "script.mjs",
      "--workflow",
      "sdxl",
      "--sampler",
      "euler",
      "--json",
      "--limit",
      "10",
    ]);
    expect(result.filters.workflow).toEqual(["sdxl"]);
    expect(result.filters.sampler).toEqual(["euler"]);
    expect(result.json).toBe(true);
    expect(result.limit).toBe(10);
  });
});

// -- formatLoras -------------------------------------------------------------

describe("formatLoras", () => {
  it("returns (none) for undefined input", () => {
    expect(formatLoras(undefined)).toBe("(none)");
  });

  it("returns (none) for empty array", () => {
    expect(formatLoras([])).toBe("(none)");
  });

  it("returns (none) for null input", () => {
    expect(formatLoras(null)).toBe("(none)");
  });

  it("returns lora names joined by comma", () => {
    const loras = [{ name: "loro1" }, { name: "loro2" }];
    expect(formatLoras(loras)).toBe("loro1, loro2");
  });
});

// -- formatText --------------------------------------------------------------

describe("formatText", () => {
  it("returns no matching message for empty results", () => {
    const result = formatText([]);
    expect(result).toBe("No matching entries found.");
  });

  it("reports single entry in singular", () => {
    const result = formatText([{ filename: "a.png" }]);
    expect(result).toContain("1 matching entry");
  });

  it("reports multiple entries in plural", () => {
    const result = formatText([{ filename: "a.png" }, { filename: "b.png" }]);
    expect(result).toContain("2 matching entries");
  });

  it("includes filename with unknown fallback", () => {
    const result = formatText([{}]);
    expect(result).toContain("(unknown)");
  });

  it("shortens long prompts with ellipsis", () => {
    const longPrompt = Array.from({ length: 30 }, (_, i) => `word${i}`).join(
      ", ",
    );
    const result = formatText([{ filename: "a.png", prompt: longPrompt }]);
    expect(result).toContain("...");
  });
});

// -- search -------------------------------------------------------------------

describe("search", () => {
  let logSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    searchLogsWithConnection.mockClear();
  });

  afterEach(() => {
    logSpy.mockRestore();
    searchLogsWithConnection.mockRestore();
  });

  it("calls searchLogsWithConnection with filters and limit", async () => {
    searchLogsWithConnection.mockResolvedValue([]);

    const filters = { workflow: ["sdxl"], sampler: ["euler"] };
    await search(filters, false, 42);

    expect(searchLogsWithConnection).toHaveBeenCalledWith(filters, 42);
  });

  it("calls searchLogsWithConnection with null limit when no limit", async () => {
    searchLogsWithConnection.mockResolvedValue([]);

    await search({}, false, null);

    expect(searchLogsWithConnection).toHaveBeenCalledWith({}, null);
  });

  it("calls searchLogsWithConnection with empty filters", async () => {
    searchLogsWithConnection.mockResolvedValue([]);

    await search({}, false, null);

    expect(searchLogsWithConnection).toHaveBeenCalledWith({}, null);
  });

  it("outputs JSON when json is true", async () => {
    const mockResults = [{ filename: "a.png", prompt: "hello" }];
    searchLogsWithConnection.mockResolvedValue(mockResults);

    await search({}, true, null);

    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(mockResults, null, 2));
  });

  it("outputs formatted text when json is false", async () => {
    const mockResults = [{ filename: "a.png", prompt: "hello" }];
    searchLogsWithConnection.mockResolvedValue(mockResults);

    await search({}, false, null);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("1 matching entry"),
    );
  });

  it("passes filters through to searchLogsWithConnection unchanged", async () => {
    searchLogsWithConnection.mockResolvedValue([]);

    const filters = {
      workflow: ["sdxl"],
      prefix: ["test"],
      lora: ["loro"],
      prompt: ["hello"],
      outputFolder: ["wallpaper"],
      sampler: ["euler"],
      scheduler: ["ddim"],
      model: ["model1", "model2"],
    };
    await search(filters, false, null);

    expect(searchLogsWithConnection).toHaveBeenCalledWith(filters, null);
  });
});

// -- runCLI -------------------------------------------------------------------

describe("runCLI", () => {
  let logSpy;
  let exitSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
    searchLogsWithConnection.mockClear();
  });

  afterEach(() => {
    logSpy.mockRestore();
    exitSpy.mockRestore();
    searchLogsWithConnection.mockRestore();
  });

  it("calls search with parsed filters when flags provided", async () => {
    searchLogsWithConnection.mockResolvedValue([]);

    await runCLI(["node", "script.mjs", "--workflow", "sdxl", "--limit", "10"]);

    expect(searchLogsWithConnection).toHaveBeenCalledWith(
      expect.objectContaining({ workflow: ["sdxl"] }),
      10,
    );
  });

  it("calls search with json flag when --json provided", async () => {
    searchLogsWithConnection.mockResolvedValue([]);

    await runCLI(["node", "script.mjs", "--json"]);

    expect(searchLogsWithConnection).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.any(String));
  });

  it("prints help when --help flag present", async () => {
    searchLogsWithConnection.mockResolvedValue([]);

    await runCLI(["node", "script.mjs", "--help"]);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Search log entries"),
    );
    expect(searchLogsWithConnection).not.toHaveBeenCalled();
  });

  it("uses process.argv when argv is undefined", async () => {
    const originalArgv = process.argv;
    process.argv = ["node", "script.mjs", "--sampler", "dpmpp"];
    searchLogsWithConnection.mockResolvedValue([]);

    await runCLI();

    expect(searchLogsWithConnection).toHaveBeenCalledWith(
      expect.objectContaining({ sampler: ["dpmpp"] }),
      null,
    );
    process.argv = originalArgv;
  });
});

// -- printHelp ---------------------------------------------------------------

describe("printHelp", () => {
  let logSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("logs help text to console", () => {
    printHelp();
    expect(logSpy).toHaveBeenCalled();
  });

  it("logs text containing option descriptions", () => {
    printHelp();
    const logged = logSpy.mock.calls[0][0];
    expect(logged).toContain("--workflow");
    expect(logged).toContain("--json");
    expect(logged).toContain("--limit");
  });
});
