import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock findWithConnection so the real MongoDB connection is never used.
vi.mock("../../logging/mongodb/find-log.mjs", () => ({
  findWithConnection: vi.fn(),
}));

import { findWithConnection } from "../../logging/mongodb/find-log.mjs";
import { parseArgs, runLookup } from "../../agent-tools/lookup-log.mjs";

// -- parseArgs ---------------------------------------------------------------

describe("parseArgs", () => {
  it("returns empty positional when argv has no third element", () => {
    const result = parseArgs(["node", "script.mjs"]);
    expect(result.positional).toEqual([]);
  });

  it("returns argv[2] wrapped in positional array", () => {
    const result = parseArgs(["node", "script.mjs", "test.png"]);
    expect(result.positional).toEqual(["test.png"]);
  });

  it("returns empty array when argv[2] is undefined", () => {
    const argv = ["node", "script.mjs", undefined];
    const result = parseArgs(argv);
    expect(result.positional).toEqual([]);
  });

  it("returns single-element array for valid string arg", () => {
    const result = parseArgs(["node", "script.mjs", "image.jpg"]);
    expect(result.positional).toHaveLength(1);
    expect(Array.isArray(result.positional)).toBe(true);
  });
});

// -- runLookup -----------------------------------------------------------------

describe("runLookup", () => {
  let exitSpy;
  let errorSpy;
  let logSpy;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    findWithConnection.mockClear();
  });

  afterEach(() => {
    exitSpy.mockRestore();
    errorSpy.mockRestore();
    logSpy.mockRestore();
    findWithConnection.mockRestore();
  });

  it("calls findWithConnection with the filename from positional args", async () => {
    const originalArgv = process.argv;
    process.argv = ["node", "script.mjs", "test.png"];

    await runLookup();

    expect(findWithConnection).toHaveBeenCalledWith("test.png");
    expect(exitSpy).toHaveBeenCalledWith(0);
    process.argv = originalArgv;
  });

  it("calls findWithConnection with a full path input", async () => {
    const originalArgv = process.argv;
    process.argv = ["node", "script.mjs", "/some/path/to/image.jpg"];

    await runLookup();

    expect(findWithConnection).toHaveBeenCalledWith("/some/path/to/image.jpg");
    process.argv = originalArgv;
  });

  it("calls findWithConnection with undefined when no input provided", async () => {
    const originalArgv = process.argv;
    process.argv = ["node", "script.mjs"];

    await runLookup();

    expect(findWithConnection).toHaveBeenCalledWith(undefined);
    expect(exitSpy).toHaveBeenCalledWith(1);
    process.argv = originalArgv;
  });

  it("calls console.error when no input provided", async () => {
    const originalArgv = process.argv;
    process.argv = ["node", "script.mjs"];

    await runLookup();

    expect(errorSpy).toHaveBeenCalledWith(
      "No arguments provided. Usage: node lookup-log.mjs <filename>",
    );
    process.argv = originalArgv;
  });

  it("calls findWithConnection even for simple single-word input", async () => {
    const originalArgv = process.argv;
    process.argv = ["node", "script.mjs", "hello"];

    await runLookup();

    expect(findWithConnection).toHaveBeenCalledWith("hello");
    expect(exitSpy).toHaveBeenCalledWith(0);
    process.argv = originalArgv;
  });
});
