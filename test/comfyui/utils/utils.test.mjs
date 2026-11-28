import { chmod, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { withTempTree } from "../../support/tmp-tree.mjs";

const uploadLogMock = vi.hoisted(() => ({ uploadLog: vi.fn() }));

vi.mock("../../../logging/upload-log.mjs", () => uploadLogMock);

uploadLogMock.uploadLog.mockResolvedValue({ uploaded: 1 });

import {
  parseInputName,
  requireInputName,
} from "../../../comfyui/utils/args.mjs";
import {
  destFileName,
  resolvePrefix,
  timestamp,
} from "../../../comfyui/utils/naming.mjs";
import {
  collectMatches,
  isFileHere,
  isInsideDir,
  REPO_DIST_DIR,
  resolveDestDir,
  resolveDistPath,
} from "../../../comfyui/utils/paths.mjs";
import { collectOutputImages } from "../../../comfyui/utils/outputs.mjs";
import {
  formatDuration,
  generationTimeMs,
  buildLogEntry,
  writeLog,
  addToLog,
} from "../../../comfyui/jobs/log.mjs";
import { collectOutputImages as collectImages } from "../../../comfyui/utils/outputs.mjs";

describe("utilities", () => {
  it("parses and formats stable names", () => {
    expect(parseInputName(["node", "comfy-batch", "demo"])).toBe("demo");
    expect(timestamp(new Date(2026, 0, 2, 3, 4, 5))).toBe("20260102030405");
    expect(resolvePrefix("nested/prefix")).toBe("prefix");
    expect(destFileName({ prefix: "x", ts: "1", index: 1, ext: ".png" })).toBe(
      "x_1_1.png",
    );
    expect(resolvePrefix(" ")).toBe("output");
    expect(destFileName({ prefix: "x", ts: "1", index: 0, ext: ".png" })).toBe(
      "x_1.png",
    );
    expect(parseInputName(["node", "cmd"])).toBeNull();
  });

  it("reports missing CLI input", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    expect(() => requireInputName(["node", "cmd"])).toThrow("exit");
    expect(error).toHaveBeenCalledWith(
      "  Finds <input-name>.yaml by name under COMFY_ASSETS_PATH/inputs",
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("returns a supplied input name without exiting", () => {
    const exit = vi.spyOn(process, "exit");
    expect(requireInputName(["node", "cmd", "valid"])).toBe("valid");
    expect(exit).not.toHaveBeenCalled();
  });

  it("prevents output-folder traversal", async () => {
    await withTempTree({ "sub/deep/file.yaml": "x" }, (root) => {
      expect(resolveDestDir(root, "nested")).toBe(path.join(root, "nested"));
      expect(resolveDestDir(root, "../../escape")).toBe(root);
      // A value that collapses back onto the base still counts as inside it,
      // which is the case containment now answers through isInsideDir("").
      expect(resolveDestDir(root, "sub/..")).toBe(root);
    });
  });

  it("handles output images and durations", () => {
    expect(
      collectOutputImages({
        a: { images: [{ type: "output" }, { type: "temp" }] },
      }),
    ).toHaveLength(1);
    expect(
      generationTimeMs({
        status: {
          messages: [
            ["execution_start", { timestamp: 100 }],
            ["execution_success", { timestamp: 2500 }],
          ],
        },
      }),
    ).toBe(2400);
    expect(formatDuration(125000)).toBe("2:05");
    expect(collectImages()).toEqual([]);
    expect(generationTimeMs({})).toBeNull();
    expect(formatDuration(-1)).toBe("0:00");
  });

  it("builds and writes log entries", async () => {
    await withTempTree(
      { "nested/.keep": "" },
      async (root) => {
        const entry = buildLogEntry({
          input: { prompt: ["x"] },
          finalWorkflowData: {
            model: "model.safetensors",
            seed: 3,
            sampler: "euler",
            scheduler: "normal",
            steps: 20,
            cfg: 8,
            positivePrompt: "base, x",
            negativePrompt: "bad",
          },
          filename: "x.png",
          elapsedMs: null,
          comfyJobId: "id",
        });
        expect(entry.generatedIn).toBeNull();
        const log = path.join(root, "nested", "log.json");
        await expect(writeLog(log, [entry])).resolves.toBeUndefined();
        const workflow = {
          KSampler: { class_type: "KSampler", inputs: { seed: 3 } },
          PositiveCLIP_Base: { inputs: { text: "base" } },
          NegativeCLIP_Base: { inputs: { text: "bad" } },
        };
        await addToLog({
          logPath: log,
          logEntries: [],
          job: { input: {}, workflow },
          saved: [{ filename: "x.png", destDir: root }],
          promptId: "id",
          historyEntry: {},
        });
      },
      "gen-ai-log-",
    );
  });
});

// The containment helper resolveDestDir was refactored onto, plus the two
// walkers the asset lookup runs on a folder of unknown depth.
// Deviation from the test mirror: comfyui/utils/paths.mjs has no twin test
// file; its exports are covered in this long-standing utils bucket.
describe("containment and tree walking", () => {
  it("accepts the base itself and everything below it", async () => {
    await withTempTree({ "sub/deep/file.yaml": "x" }, async (root) => {
      expect(isInsideDir(root, root)).toBe(true);
      expect(
        isInsideDir(root, path.join(root, "sub", "deep", "file.yaml")),
      ).toBe(true);
      // The same folder written another way is still the base.
      expect(isInsideDir(root, path.join(root, "sub", ".."))).toBe(true);
      expect(isInsideDir(root, path.dirname(root))).toBe(false);
      expect(isInsideDir(root, path.join(root, ".."))).toBe(false);
      // A sibling that shares the base's name prefix is not inside it.
      expect(isInsideDir(root, `${root}-sibling`)).toBe(false);
    });
  });

  it("counts regular files, linked ones included, and nothing else", async () => {
    await withTempTree(
      { "real.txt": "target", "folder/keep.txt": "nested" },
      async (root) => {
        await symlink(path.join(root, "real.txt"), path.join(root, "link.txt"));
        await symlink(path.join(root, "folder"), path.join(root, "dirlink"));
        await symlink(
          path.join(root, "missing.txt"),
          path.join(root, "broken.txt"),
        );
        await symlink(
          path.join(root, "cycle.txt"),
          path.join(root, "cycle.txt"),
        );
        expect(await isFileHere(path.join(root, "real.txt"))).toBe(true);
        // stat() follows the link, so a linked file is a real file here.
        expect(await isFileHere(path.join(root, "link.txt"))).toBe(true);
        expect(await isFileHere(path.join(root, "folder"))).toBe(false);
        expect(await isFileHere(path.join(root, "dirlink"))).toBe(false);
        expect(await isFileHere(path.join(root, "missing.txt"))).toBe(false);
        // A dangling link and a link that only points at itself are absent,
        // not a failure worth stopping the walk for.
        expect(await isFileHere(path.join(root, "broken.txt"))).toBe(false);
        expect(await isFileHere(path.join(root, "cycle.txt"))).toBe(false);
      },
    );
  });

  it("passes a permission failure through instead of calling it absent", async () => {
    await withTempTree({ "locked/inside.txt": "x" }, async (root) => {
      const locked = path.join(root, "locked");
      await chmod(locked, 0o000);
      try {
        await expect(
          isFileHere(path.join(locked, "inside.txt")),
        ).rejects.toThrow(/EACCES/);
        await expect(collectMatches(locked, "inside.txt")).rejects.toThrow(
          /EACCES/,
        );
      } finally {
        await chmod(locked, 0o755);
      }
    });
  });

  it("searches shallow levels first and reports every match", async () => {
    await withTempTree(
      {
        "goal.yaml": "top",
        "a/goal.yaml": "branch",
        "c/goal.yaml": "other branch",
        "a/b/goal.yaml": "deep",
        "c/b/goal.yaml": "other deep",
      },
      async (root) => {
        const matches = await collectMatches(root, "goal.yaml");
        expect(new Set(matches)).toEqual(
          new Set([
            path.join(root, "goal.yaml"),
            path.join(root, "a", "goal.yaml"),
            path.join(root, "c", "goal.yaml"),
            path.join(root, "a", "b", "goal.yaml"),
            path.join(root, "c", "b", "goal.yaml"),
          ]),
        );
        // Folders are queued level by level, so the depths come out low to
        // high: the shallower copy heads the list and the ambiguous report
        // offers it first. Only the level order is pinned, not the order two
        // siblings come back in, which readdir does not promise.
        const depths = matches.map(
          (match) => path.relative(root, match).split(path.sep).length - 1,
        );
        expect(depths).toEqual([0, 1, 1, 2, 2]);
        expect(matches[0]).toBe(path.join(root, "goal.yaml"));
      },
    );
  });

  it("skips folders a shared tree carries and never follows a linked folder", async () => {
    await withTempTree(
      {
        "base/live/goal.yaml": "live",
        "base/node_modules/pkg/goal.yaml": "dependency",
        "base/.git/objects/goal.yaml": "version control",
        // outside/ is a sibling of the base, reachable only through the link.
        "outside/goal.yaml": "outside the base",
      },
      async (root) => {
        const base = path.join(root, "base");
        await symlink(path.join(root, "outside"), path.join(base, "mirror"));
        expect(await collectMatches(base, "goal.yaml")).toEqual([
          path.join(base, "live", "goal.yaml"),
        ]);
      },
    );
  });

  it("answers with nothing when there is no folder to walk", async () => {
    await withTempTree({ "goal.yaml": "top" }, async (root) => {
      // A base that does not exist, and a base that is a file, both simply
      // hold no matches rather than failing the lookup.
      await expect(
        collectMatches(path.join(root, "absent"), "goal.yaml"),
      ).resolves.toEqual([]);
      await expect(
        collectMatches(path.join(root, "goal.yaml"), "goal.yaml"),
      ).resolves.toEqual([]);
      await expect(collectMatches(root, "ghost.yaml")).resolves.toEqual([]);
    });
  });
});

// resolveDistPath owns the dist base: blank falls back to repo-root dist/, a
// set value is taken literally and must be absolute. No file access happens
// here — pure string handling.
describe("resolveDistPath", () => {
  it("is absolute and named dist", () => {
    expect(path.isAbsolute(REPO_DIST_DIR)).toBe(true);
    expect(path.basename(REPO_DIST_DIR)).toBe("dist");
  });

  it("falls back to repo-root dist when unset or blank", () => {
    expect(resolveDistPath({})).toBe(REPO_DIST_DIR);
    expect(resolveDistPath({ COMFY_DIST_PATH: "" })).toBe(REPO_DIST_DIR);
    expect(resolveDistPath({ COMFY_DIST_PATH: "   " })).toBe(REPO_DIST_DIR);
  });

  it("takes a set absolute path literally, trimmed and normalized", () => {
    const tmp = path.join(os.tmpdir(), "resolve-dist-path-test");
    expect(resolveDistPath({ COMFY_DIST_PATH: tmp })).toBe(tmp);
    expect(resolveDistPath({ COMFY_DIST_PATH: `  ${tmp}  ` })).toBe(tmp);
    expect(
      resolveDistPath({ COMFY_DIST_PATH: `${tmp}/../resolve-dist-path-test/` }),
    ).toBe(tmp);
  });

  it("throws for a set non-absolute path", () => {
    expect(() => resolveDistPath({ COMFY_DIST_PATH: "relative/dist" })).toThrow(
      /COMFY_DIST_PATH must be an absolute path/,
    );
  });
});
