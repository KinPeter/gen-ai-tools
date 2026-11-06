import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Layout deviation from the mirror: this file tests
// tools-hub/routes/static/distbrowser/ui-build.mjs and sits flat under
// test/tools-hub/routes/static/, matching the local convention used for
// assets.test.mjs and logfinder.test.mjs.
//
// Vite is a devDependency imported lazily by ui-build.mjs; it is mocked so no
// real build runs and nothing is written into the repository.
vi.mock("vite", () => ({ build: vi.fn() }));

import { build as viteBuild } from "vite";
import {
  DIST_BROWSER_UI_DIST_DIR,
  DIST_BROWSER_UI_SOURCE_DIR,
  resolveRepoRoot,
} from "../../../../tools-hub/utils/index.mjs";

import uiBuildModule, {
  buildDistBrowserUi,
  hasUiArtifacts,
  isUiBuildSkipped,
} from "../../../../tools-hub/routes/static/distbrowser/ui-build.mjs";

const SKIP_VAR = "TOOLS_HUB_SKIP_UI_BUILD";

function createLog() {
  return { log: vi.fn(), error: vi.fn() };
}

/** All messages passed to a log spy, as strings. */
function loggedMessages(spy) {
  return spy.mock.calls.map((args) => String(args[0]));
}

/** Create a throwaway directory that stands in for the Vite build output. */
async function makeDistDir({ files = {} } = {}) {
  const distDir = await mkdtemp(path.join(os.tmpdir(), "ui-build-test-"));

  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(distDir, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }

  return distDir;
}

describe("dist-browser UI build", () => {
  let distDir = null;

  afterEach(async () => {
    if (distDir) {
      await rm(distDir, { recursive: true, force: true });
      distDir = null;
    }
    viteBuild.mockReset();
  });

  describe("module surface", () => {
    it("exports the build helper as default and named exports", () => {
      expect(uiBuildModule).toBe(buildDistBrowserUi);
      expect(isUiBuildSkipped).toBeTypeOf("function");
      expect(hasUiArtifacts).toBeTypeOf("function");
    });
  });

  describe("isUiBuildSkipped", () => {
    it("is false when the env var is absent or empty", () => {
      expect(isUiBuildSkipped({})).toBe(false);
      expect(isUiBuildSkipped({ [SKIP_VAR]: "" })).toBe(false);
      expect(isUiBuildSkipped({ OTHER_VAR: "1" })).toBe(false);
    });

    it("is true for the documented truthy values", () => {
      for (const value of ["1", "true", "yes"]) {
        expect(isUiBuildSkipped({ [SKIP_VAR]: value })).toBe(true);
      }
    });

    it("matches truthy values case-insensitively", () => {
      expect(isUiBuildSkipped({ [SKIP_VAR]: "TRUE" })).toBe(true);
      expect(isUiBuildSkipped({ [SKIP_VAR]: "Yes" })).toBe(true);
    });

    it("is false for anything else", () => {
      for (const value of ["0", "false", "no", "maybe", " ", " 1 "]) {
        expect(isUiBuildSkipped({ [SKIP_VAR]: value })).toBe(false);
      }
    });

    it("coerces a non-string value to a string", () => {
      expect(isUiBuildSkipped({ [SKIP_VAR]: 1 })).toBe(true);
      expect(isUiBuildSkipped({ [SKIP_VAR]: 0 })).toBe(false);
    });

    it("defaults to process.env", () => {
      const previous = process.env[SKIP_VAR];

      process.env[SKIP_VAR] = "true";
      expect(isUiBuildSkipped()).toBe(true);

      process.env[SKIP_VAR] = "";
      expect(isUiBuildSkipped()).toBe(false);

      if (previous === undefined) delete process.env[SKIP_VAR];
      else process.env[SKIP_VAR] = previous;
    });
  });

  describe("hasUiArtifacts", () => {
    it("is true when the entry file is present", async () => {
      distDir = await makeDistDir({
        files: { "index.html": "<html>UI</html>" },
      });
      expect(hasUiArtifacts(distDir)).toBe(true);
    });

    it("is false when only other files are present", async () => {
      distDir = await makeDistDir({ files: { "assets/app.js": "app" } });
      expect(hasUiArtifacts(distDir)).toBe(false);
    });

    it("is false when the directory does not exist", async () => {
      distDir = await mkdtemp(path.join(os.tmpdir(), "ui-build-missing-"));
      await rm(distDir, { recursive: true, force: true });

      expect(hasUiArtifacts(distDir)).toBe(false);
    });
  });

  describe("buildDistBrowserUi", () => {
    it("skips the build and reports existing artifacts when the env var is set", async () => {
      distDir = await makeDistDir({
        files: { "index.html": "<html>UI</html>" },
      });
      const log = createLog();

      const result = await buildDistBrowserUi({
        env: { [SKIP_VAR]: "1" },
        log,
        paths: { root: "/ui-root", distDir },
      });

      expect(result).toEqual({
        built: false,
        skipped: true,
        distDir,
        artifactsAvailable: true,
      });
      expect(log.log).toHaveBeenCalledTimes(1);
      expect(loggedMessages(log.log)[0]).toContain("UI build skipped");
      expect(loggedMessages(log.log)[0]).toContain(SKIP_VAR);
      expect(log.error).not.toHaveBeenCalled();
      expect(viteBuild).not.toHaveBeenCalled();
    });

    it("reports no artifacts when the build is skipped and nothing was built", async () => {
      distDir = await makeDistDir();
      const log = createLog();

      const result = await buildDistBrowserUi({
        env: { [SKIP_VAR]: "yes" },
        log,
        paths: { root: "/ui-root", distDir },
      });

      expect(result).toEqual({
        built: false,
        skipped: true,
        distDir,
        artifactsAvailable: false,
      });
    });

    it("uses process.env and console when they are not supplied", async () => {
      distDir = await makeDistDir({
        files: { "index.html": "<html>UI</html>" },
      });
      const previous = process.env[SKIP_VAR];
      process.env[SKIP_VAR] = "true";
      const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

      try {
        const result = await buildDistBrowserUi({
          paths: { root: "/ui-root", distDir },
        });

        expect(result.skipped).toBe(true);
        expect(result.artifactsAvailable).toBe(true);
        expect(consoleLog).toHaveBeenCalledTimes(1);
        expect(String(consoleLog.mock.calls[0][0])).toContain(
          "UI build skipped",
        );
        expect(String(consoleLog.mock.calls[0][0])).toContain(SKIP_VAR);
      } finally {
        if (previous === undefined) delete process.env[SKIP_VAR];
        else process.env[SKIP_VAR] = previous;
      }
    });

    it("runs the Vite build against the UI root and dist directory", async () => {
      distDir = await makeDistDir();
      const log = createLog();
      viteBuild.mockResolvedValue(undefined);

      const result = await buildDistBrowserUi({
        env: {},
        log,
        paths: { root: "/ui-root", distDir },
      });

      expect(viteBuild).toHaveBeenCalledWith({
        root: "/ui-root",
        build: { outDir: distDir, emptyOutDir: true },
      });
      expect(result).toEqual({
        built: true,
        skipped: false,
        distDir,
        artifactsAvailable: true,
      });
      expect(log.log).toHaveBeenCalledTimes(1);
      expect(loggedMessages(log.log)[0]).toContain(
        "dist-browser UI built into",
      );
      expect(loggedMessages(log.log)[0]).toContain(distDir);
      expect(log.error).not.toHaveBeenCalled();
    });

    it("defaults paths to the dist-browser source and its build output", async () => {
      const log = createLog();
      viteBuild.mockResolvedValue(undefined);

      const result = await buildDistBrowserUi({ env: {}, log });

      expect(viteBuild).toHaveBeenCalledWith({
        root: resolveRepoRoot(DIST_BROWSER_UI_SOURCE_DIR),
        build: {
          outDir: resolveRepoRoot(DIST_BROWSER_UI_DIST_DIR),
          emptyOutDir: true,
        },
      });
      expect(result.distDir).toBe(resolveRepoRoot(DIST_BROWSER_UI_DIST_DIR));
      expect(result.built).toBe(true);
      expect(result.artifactsAvailable).toBe(true);
    });

    it("reports failure and existing artifacts when the build throws", async () => {
      distDir = await makeDistDir({
        files: { "index.html": "<html>UI</html>" },
      });
      const log = createLog();
      viteBuild.mockImplementation(() => {
        throw new Error("vite exploded");
      });

      const result = await buildDistBrowserUi({
        env: {},
        log,
        paths: { root: "/ui-root", distDir },
      });

      expect(result.built).toBe(false);
      expect(result.skipped).toBe(false);
      expect(result.distDir).toBe(distDir);
      expect(result.artifactsAvailable).toBe(true);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toBe("vite exploded");
      expect(log.error).toHaveBeenCalledTimes(1);
      expect(loggedMessages(log.error)[0]).toContain(
        "dist-browser UI build failed",
      );
      expect(loggedMessages(log.error)[0]).toContain("vite exploded");
      expect(loggedMessages(log.log)[0]).toContain(
        "Serving existing UI artifacts",
      );
      expect(loggedMessages(log.log)[0]).toContain(distDir);
    });

    it("reports failure with no artifacts when nothing was ever built", async () => {
      distDir = await makeDistDir();
      const log = createLog();
      viteBuild.mockRejectedValue(new Error("vite is missing"));

      const result = await buildDistBrowserUi({
        env: {},
        log,
        paths: { root: "/ui-root", distDir },
      });

      expect(result).toMatchObject({
        built: false,
        skipped: false,
        distDir,
        artifactsAvailable: false,
      });
      expect(log.error).toHaveBeenCalledTimes(1);
      expect(loggedMessages(log.error)[0]).toContain(
        "dist-browser UI build failed",
      );
      expect(loggedMessages(log.error)[0]).toContain("vite is missing");
      expect(log.log).toHaveBeenCalledTimes(1);
      expect(loggedMessages(log.log)[0]).toContain("No UI artifacts");
      expect(loggedMessages(log.log)[0]).toContain(distDir);
      expect(loggedMessages(log.log)[0]).toContain(
        "npm run dist-browser:build",
      );
      expect(loggedMessages(log.log)[0]).toContain(SKIP_VAR);
    });

    it("does not throw when the build fails", async () => {
      distDir = await makeDistDir();
      viteBuild.mockRejectedValue(new Error("boom"));

      await expect(
        buildDistBrowserUi({
          env: {},
          log: createLog(),
          paths: { root: "/ui-root", distDir },
        }),
      ).resolves.toBeDefined();
    });
  });
});
