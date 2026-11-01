import { describe, expect, it, afterEach, beforeEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  normalizeToPngFilename,
  parseArgs,
  resolveLogsDir,
  collectJsonFiles,
  findLogEntry,
} from "../../agent-tools/lookup-log.mjs";

// -- helpers -----------------------------------------------------------------

/**
 * Create a temp directory containing a known JSON log file and return its
 * absolute path.  The JSON array holds two entries: one with the target
 * filename and another with a different filename.
 */
async function createTempLogsDir() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lookup-log-"));
  const jsonFile = path.join(tmpDir, "test_000001.json");
  const content = JSON.stringify([
    { filename: "test_image.png", data: "found_entry" },
    { filename: "other_image.png", data: "other_entry" },
  ]);
  await fs.writeFile(jsonFile, content, "utf8");
  return { tmpDir, jsonFile };
}

/**
 * Create a temp directory with exactly three files: a.json, b.json, c.txt.
 */
async function createSimpleTempDir() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lookup-log-"));
  await fs.writeFile(path.join(tmpDir, "a.json"), "{}", "utf8");
  await fs.writeFile(path.join(tmpDir, "b.json"), "{}", "utf8");
  await fs.writeFile(path.join(tmpDir, "c.txt"), "text", "utf8");
  return tmpDir;
}

async function cleanup(dir) {
  await fs.rm(dir, { recursive: true, force: true });
}

// -- normalizeToPngFilename --------------------------------------------------

describe("normalizeToPngFilename", () => {
  it("converts jpg to png", () => {
    expect(normalizeToPngFilename("myimage.jpg")).toBe("myimage.png");
  });

  it("converts already-png filenames unchanged", () => {
    expect(normalizeToPngFilename("myimage.png")).toBe("myimage.png");
  });

  it("handles nested paths", () => {
    expect(normalizeToPngFilename("some/path/myimage.jpg")).toBe("myimage.png");
  });

  it("handles backslashes", () => {
    expect(normalizeToPngFilename("some\\\\path\\\\myimage.jpg")).toBe(
      "myimage.png",
    );
  });

  it("strips existing extension and adds .png", () => {
    expect(normalizeToPngFilename("myimage.safetensors")).toBe("myimage.png");
  });

  it("returns null for empty input", () => {
    expect(normalizeToPngFilename("")).toBe(null);
  });

  it("returns null for whitespace-only input", () => {
    expect(normalizeToPngFilename("   ")).toBe(null);
  });

  it("returns null for undefined input", () => {
    expect(normalizeToPngFilename(undefined)).toBe(null);
  });

  it("handles path without extension", () => {
    expect(normalizeToPngFilename("myimage")).toBe("myimage.png");
  });
});

// -- parseArgs ---------------------------------------------------------------

describe("parseArgs", () => {
  it("parses positional arg", () => {
    const argv = ["node", "lookup-log.mjs", "myimage.jpg"];
    const result = parseArgs(argv);
    expect(result.positional).toEqual(["myimage.jpg"]);
    expect(result.logsDir).toBe("output/logs/");
    expect(result.file).toBeNull();
  });

  it("parses --logs-dir flag", () => {
    const argv = ["node", "lookup-log.mjs", "--logs-dir", "/custom/logs"];
    const result = parseArgs(argv);
    expect(result.logsDir).toBe("/custom/logs");
  });

  it("parses --file flag", () => {
    const argv = ["node", "lookup-log.mjs", "--file", "custom.json"];
    const result = parseArgs(argv);
    expect(result.file).toBe("custom.json");
  });

  it("parses --file with positional", () => {
    const argv = [
      "node",
      "lookup-log.mjs",
      "--file",
      "custom.json",
      "myimage.jpg",
    ];
    const result = parseArgs(argv);
    expect(result.file).toBe("custom.json");
    expect(result.positional).toEqual(["myimage.jpg"]);
  });

  it("parses --logs-dir before positional", () => {
    const argv = ["node", "lookup-log.mjs", "--logs-dir", "/x", "myimage.jpg"];
    const result = parseArgs(argv);
    expect(result.logsDir).toBe("/x");
    expect(result.positional).toEqual(["myimage.jpg"]);
  });

  it("handles no args", () => {
    const argv = ["node", "lookup-log.mjs"];
    const result = parseArgs(argv);
    expect(result.positional).toEqual([]);
    expect(result.logsDir).toBe("output/logs/");
    expect(result.file).toBeNull();
  });
});

// -- resolveLogsDir ----------------------------------------------------------

describe("resolveLogsDir", () => {
  it("resolves relative path against CWD", () => {
    const result = resolveLogsDir("output/logs/");
    expect(result).toBe(path.join(process.cwd(), "output/logs/"));
  });

  it("returns absolute path unchanged", () => {
    const abs = path.join(process.cwd(), "custom/logs");
    expect(resolveLogsDir(abs)).toBe(abs);
  });

  it("resolves bare dirname", () => {
    const result = resolveLogsDir("logs");
    expect(result).toBe(path.join(process.cwd(), "logs"));
  });
});

// -- collectJsonFiles --------------------------------------------------------

describe("collectJsonFiles", () => {
  it("collects only .json files from temp directory", async () => {
    const tmpDir = await createSimpleTempDir();
    try {
      const files = await collectJsonFiles(tmpDir);
      expect(files.length).toBe(2);
      for (const f of files) {
        expect(f).toMatch(/\.json$/);
      }
    } finally {
      await cleanup(tmpDir);
    }
  });

  it("returns sorted file paths", async () => {
    const tmpDir = await createSimpleTempDir();
    try {
      const files = await collectJsonFiles(tmpDir);
      expect(files).toEqual([...files].sort());
    } finally {
      await cleanup(tmpDir);
    }
  });

  it("returns empty array for missing directory", async () => {
    const files = await collectJsonFiles("/tmp/does-not-exist-dir-xyz");
    expect(files).toEqual([]);
  });
});

// -- findLogEntry ------------------------------------------------------------

describe("findLogEntry", () => {
  it("finds an entry by filename in a temp logs directory", async () => {
    const { tmpDir } = await createTempLogsDir();
    try {
      const result = await findLogEntry({
        logsDir: tmpDir,
        targetFilename: "test_image.png",
      });
      expect(result).not.toBeNull();
      expect(result.entry.filename).toBe("test_image.png");
      expect(result.sourceFile).toMatch(/\.json$/);
    } finally {
      await cleanup(tmpDir);
    }
  });

  it("returns null for non-existent filename", async () => {
    const { tmpDir } = await createTempLogsDir();
    try {
      const result = await findLogEntry({
        logsDir: tmpDir,
        targetFilename: "nonexistent_file_12345.png",
      });
      expect(result).toBeNull();
    } finally {
      await cleanup(tmpDir);
    }
  });

  it("restricts to a specific file when --file is given", async () => {
    const { tmpDir, jsonFile } = await createTempLogsDir();
    try {
      const result = await findLogEntry({
        logsDir: tmpDir,
        file: jsonFile,
        targetFilename: "test_image.png",
      });
      expect(result).not.toBeNull();
      expect(result.sourceFile).toBe(jsonFile);
    } finally {
      await cleanup(tmpDir);
    }
  });

  it("handles missing logs directory gracefully", async () => {
    const result = await findLogEntry({
      logsDir: "/tmp/nonexistent-logs-dir-abc",
      targetFilename: "any.png",
    });
    expect(result).toBeNull();
  });
});

// -- Golden-file CLI tests ---------------------------------------------------

describe("CLI golden-file tests", () => {
  let tmpDir;
  let jsonFile;

  beforeEach(async () => {
    const created = await createTempLogsDir();
    tmpDir = created.tmpDir;
    jsonFile = created.jsonFile;
  });

  afterEach(async () => {
    await cleanup(tmpDir);
  });

  it("exits with code 0 for found entry", async () => {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync(
      "node",
      [
        path.join(process.cwd(), "agent-tools/lookup-log.mjs"),
        "--logs-dir",
        tmpDir,
        "test_image.png",
      ],
      { encoding: "utf8", timeout: 10000 },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("test_image.png");
  });

  it("exits with code 0 for not-found entry", async () => {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync(
      "node",
      [
        path.join(process.cwd(), "agent-tools/lookup-log.mjs"),
        "--logs-dir",
        tmpDir,
        "nonexistent_12345.png",
      ],
      { encoding: "utf8", timeout: 10000 },
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("No log entry found");
  });

  it("supports --logs-dir flag", async () => {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync(
      "node",
      [
        path.join(process.cwd(), "agent-tools/lookup-log.mjs"),
        "--logs-dir",
        tmpDir,
        "test_image.png",
      ],
      { encoding: "utf8", timeout: 10000 },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("test_image.png");
  });

  it("supports --file flag", async () => {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync(
      "node",
      [
        path.join(process.cwd(), "agent-tools/lookup-log.mjs"),
        "--file",
        jsonFile,
        "test_image.png",
      ],
      { encoding: "utf8", timeout: 10000 },
    );
    expect(result.status).toBe(0);
  });

  it("exits with code 1 when no arguments provided", async () => {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync(
      "node",
      [path.join(process.cwd(), "agent-tools/lookup-log.mjs")],
      { encoding: "utf8", timeout: 10000 },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("No arguments provided");
  });
});
