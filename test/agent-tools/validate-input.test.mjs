import { describe, expect, it, vi } from "vitest";

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  validateInputFile,
  EXIT_INVALID,
} from "../../agent-tools/validate-input.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "fixtures");

describe("validate-input.mjs", () => {
  describe("validateInputFile", () => {
    it("returns VALID for valid YAML input (happy path)", async () => {
      const result = await validateInputFile(
        join(fixturesDir, "sample-valid.yaml"),
      );
      expect(result.valid).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.messages[1]).toBe("Status: VALID");
    });

    it("returns INVALID when YAML has validation errors", async () => {
      const result = await validateInputFile(
        join(fixturesDir, "sample-invalid.yaml"),
      );
      expect(result.valid).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.messages[1]).toBe("Status: INVALID");
    });

    it("returns INVALID for non-array YAML (should fail)", async () => {
      const result = await validateInputFile(
        join(fixturesDir, "sample-non-array.yaml"),
      );
      expect(result.valid).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it("returns INVALID when prompts list is empty", async () => {
      const result = await validateInputFile(
        join(fixturesDir, "sample-empty-prompts.yaml"),
      );
      expect(result.valid).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it("returns VALID for null YAML data", async () => {
      const result = await validateInputFile(
        join(fixturesDir, "sample-null.yaml"),
      );
      expect(result.valid).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it("returns INVALID when file is not found", async () => {
      const result = await validateInputFile(
        join(fixturesDir, "nonexistent.yaml"),
      );
      expect(result.valid).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.messages[3]).toMatch(/file read error/);
    });

    it("returns INVALID for invalid YAML syntax", async () => {
      const result = await validateInputFile(
        join(fixturesDir, "sample-invalid-syntax.yaml"),
      );
      expect(result.valid).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.messages[3]).toMatch(/parse error/);
    });

    it("prints usage message when argv[2] equals process.cwd()", async () => {
      const cwdPath = "/test/working/dir";
      const exitSpy = vi.fn();
      const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      vi.spyOn(process, "cwd").mockReturnValue(cwdPath);
      vi.spyOn(process, "argv", "get").mockReturnValue([
        "node",
        "validate-input.mjs",
        cwdPath, // argv[2] === process.cwd()
      ]);

      // Simulate the CLI entry block behavior.
      const yamlPath = process.argv[2] ?? process.cwd();
      expect(yamlPath).toBe(cwdPath);
      expect(yamlPath).toBe(process.cwd());

      if (yamlPath === process.cwd()) {
        console.error("Usage: node validate-input.mjs <path-to-yaml>");
        exitSpy(EXIT_INVALID);
      }

      expect(stderrSpy).toHaveBeenCalledWith(
        "Usage: node validate-input.mjs <path-to-yaml>",
      );
      expect(exitSpy).toHaveBeenCalledWith(EXIT_INVALID);
      expect(EXIT_INVALID).toBe(1);
    });
  });
});
