import { symlink } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withTempTree } from "../../support/tmp-tree.mjs";
import {
  REPO_ASSETS_DIR,
  REPO_ASSET_DIRS,
  assetDirs,
  assetFileName,
  findAssetPath,
  resolveAssetPaths,
} from "../../../comfyui/utils/assets.mjs";

// The repo checkout this test file lives in is the fallback asset base, so the
// expected value is spelled out from the folder above test/.
const REPO_ROOT = path.join(import.meta.dirname, "..", "..", "..");

// The job names a file, never where it sits: the extension is added only when
// the caller left it off, and never twice.
describe("asset names", () => {
  it("adds the extension when the caller left it off", () => {
    expect(assetFileName("new-images", ".yaml")).toBe("new-images.yaml");
    expect(assetFileName("archive/new-images", ".yaml")).toBe(
      "archive/new-images.yaml",
    );
    expect(assetFileName(7, ".json")).toBe("7.json");
    // A name the caller never filled in is still turned into text, so the
    // lookup runs on a file name instead of on a missing value.
    expect(assetFileName(null, ".yaml")).toBe("null.yaml");
    expect(assetFileName(undefined, ".yaml")).toBe("undefined.yaml");
  });

  it("keeps the extension the caller already wrote", () => {
    expect(assetFileName("krea2.json", ".json")).toBe("krea2.json");
    // The check is against this extension only, so a different one is not
    // mistaken for "already there".
    expect(assetFileName("notes.txt", ".json")).toBe("notes.txt.json");
  });
});

describe("asset base", () => {
  it("always reads inputs and base workflows from the same base", () => {
    expect(assetDirs("/vault/comfyui")).toStrictEqual({
      assetsPath: "/vault/comfyui",
      inputsDir: path.join("/vault/comfyui", "inputs"),
      workflowsDir: path.join("/vault/comfyui", "workflows"),
    });
    // The fallback base spelled out from the checkout root as literals, so
    // moving comfyui/ is a caught change instead of a self-referential pass.
    expect(REPO_ASSETS_DIR).toBe(path.join(REPO_ROOT, "comfyui"));
    expect(REPO_ASSET_DIRS).toStrictEqual({
      assetsPath: path.join(REPO_ROOT, "comfyui"),
      inputsDir: path.join(REPO_ROOT, "comfyui", "inputs"),
      workflowsDir: path.join(REPO_ROOT, "comfyui", "workflows"),
    });
  });

  it("falls back to comfyui/ in this repo when COMFY_ASSETS_PATH is unset or blank", () => {
    for (const env of [
      {},
      { COMFY_ASSETS_PATH: undefined },
      { COMFY_ASSETS_PATH: "" },
      { COMFY_ASSETS_PATH: "   " },
    ]) {
      expect(resolveAssetPaths(env)).toStrictEqual(REPO_ASSET_DIRS);
    }
  });

  it("takes an absolute COMFY_ASSETS_PATH literally and normalizes it", () => {
    expect(
      resolveAssetPaths({ COMFY_ASSETS_PATH: "  /vault/comfyui  " }),
    ).toStrictEqual(assetDirs("/vault/comfyui"));
    expect(
      resolveAssetPaths({ COMFY_ASSETS_PATH: "/vault/old/../comfyui" }),
    ).toStrictEqual(assetDirs("/vault/comfyui"));
    // A trailing separator stays on the reported base (it is what the batch
    // prints), but the folders below it come out joined and clean either way.
    const trailing = resolveAssetPaths({
      COMFY_ASSETS_PATH: "/vault/comfyui/",
    });
    expect(trailing.inputsDir).toBe(path.join("/vault/comfyui", "inputs"));
    expect(trailing.workflowsDir).toBe(
      path.join("/vault/comfyui", "workflows"),
    );
    // Not expanded against the cwd: a leading "~" or a relative path would
    // make the lookup depend on where the batch was started from.
    expect(() =>
      resolveAssetPaths({ COMFY_ASSETS_PATH: "~/vault/comfyui" }),
    ).toThrow("COMFY_ASSETS_PATH must be an absolute path");
    expect(() => resolveAssetPaths({ COMFY_ASSETS_PATH: "comfyui" })).toThrow(
      'COMFY_ASSETS_PATH must be an absolute path: "comfyui"',
    );
  });
});

describe("findAssetPath", () => {
  it("tries the exact join first, so sub/<name> means that file", async () => {
    await withTempTree(
      {
        "inputs/sub/wanted.yaml": "exact",
        // The same file name higher up and in another branch would make a
        // name-only search ambiguous: the exact join has to win before it runs.
        "inputs/wanted.yaml": "top",
        "inputs/other/wanted.yaml": "other",
      },
      async (root) => {
        const inputsDir = path.join(root, "inputs");
        await expect(findAssetPath(inputsDir, "sub/wanted.yaml")).resolves.toBe(
          path.join(inputsDir, "sub", "wanted.yaml"),
        );
      },
    );
  });

  it("falls back to the name search when the exact join lands on a folder", async () => {
    await withTempTree(
      {
        // inputs/sub/wanted.yaml is a directory, so the join points somewhere
        // real that is not an asset, and the search has to carry on past it.
        "inputs/sub/wanted.yaml/notes.txt": "",
        "inputs/deep/wanted.yaml": "the file",
      },
      async (root) => {
        const inputsDir = path.join(root, "inputs");
        await expect(findAssetPath(inputsDir, "sub/wanted.yaml")).resolves.toBe(
          path.join(inputsDir, "deep", "wanted.yaml"),
        );
      },
    );
  });

  it("searches the whole tree by file name when the exact join misses", async () => {
    await withTempTree(
      { "inputs/archive/2024/deep/wanted.yaml": "archived" },
      async (root) => {
        const inputsDir = path.join(root, "inputs");
        const expected = path.join(
          inputsDir,
          "archive",
          "2024",
          "deep",
          "wanted.yaml",
        );
        await expect(findAssetPath(inputsDir, "wanted.yaml")).resolves.toBe(
          expected,
        );
        // A sub/ prefix that does not exist still finds the file by name.
        await expect(
          findAssetPath(inputsDir, "archive/wanted.yaml"),
        ).resolves.toBe(expected);
      },
    );
  });

  it("resolves a relative base against the cwd, not against the search", async () => {
    await withTempTree({ "inputs/wanted.yaml": "x" }, async (root) => {
      const relativeBase = path.relative(
        process.cwd(),
        path.join(root, "inputs"),
      );
      await expect(findAssetPath(relativeBase, "wanted.yaml")).resolves.toBe(
        path.join(root, "inputs", "wanted.yaml"),
      );
    });
  });

  it("finds symlinked files but does not follow symlinked folders", async () => {
    await withTempTree(
      { "inputs/archive/.keep": "", "vault/real.yaml": "target" },
      async (root) => {
        const inputsDir = path.join(root, "inputs");
        // The link sits one folder deep, so the search has to reach it and
        // count it: stat() follows the link to the file it points at.
        await symlink(
          path.join(root, "vault", "real.yaml"),
          path.join(inputsDir, "archive", "link.yaml"),
        );
        await expect(findAssetPath(inputsDir, "link.yaml")).resolves.toBe(
          path.join(inputsDir, "archive", "link.yaml"),
        );
        await symlink(path.join(root, "vault"), path.join(inputsDir, "mirror"));
        // real.yaml is only reachable through the linked folder, and the walk
        // never enters it, so the file cannot be found and cannot cycle.
        await expect(findAssetPath(inputsDir, "real.yaml")).rejects.toThrow(
          'No file "real.yaml" found under',
        );
      },
    );
    await withTempTree({ "inputs/a/b/wanted.yaml": "nested" }, async (root) => {
      const inputsDir = path.join(root, "inputs");
      await symlink(inputsDir, path.join(inputsDir, "self"));
      await expect(findAssetPath(inputsDir, "wanted.yaml")).resolves.toBe(
        path.join(inputsDir, "a", "b", "wanted.yaml"),
      );
    });
  });

  it("skips node_modules and .git while searching", async () => {
    await withTempTree(
      {
        "inputs/live/wanted.yaml": "live",
        "inputs/node_modules/pkg/wanted.yaml": "dependency",
        "inputs/.git/objects/wanted.yaml": "version control",
        "inputs/node_modules/only-in-deps.yaml": "dependency only",
        "inputs/.git/only-in-vcs.yaml": "vcs only",
      },
      async (root) => {
        const inputsDir = path.join(root, "inputs");
        await expect(findAssetPath(inputsDir, "wanted.yaml")).resolves.toBe(
          path.join(inputsDir, "live", "wanted.yaml"),
        );
        await expect(
          findAssetPath(inputsDir, "only-in-deps.yaml"),
        ).rejects.toThrow('No file "only-in-deps.yaml" found under');
        await expect(
          findAssetPath(inputsDir, "only-in-vcs.yaml"),
        ).rejects.toThrow('No file "only-in-vcs.yaml" found under');
      },
    );
  });

  it("refuses to guess between two files with the same name", async () => {
    await withTempTree(
      { "inputs/a/wanted.yaml": "first", "inputs/b/wanted.yaml": "second" },
      async (root) => {
        const inputsDir = path.join(root, "inputs");
        const error = await findAssetPath(inputsDir, "wanted.yaml").catch(
          (err) => err,
        );
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toContain('Ambiguous "wanted.yaml":');
        // Both candidates are named so the run can tell which copy to move.
        expect(error.message).toContain(
          path.join(inputsDir, "a", "wanted.yaml"),
        );
        expect(error.message).toContain(
          path.join(inputsDir, "b", "wanted.yaml"),
        );
      },
    );
  });

  it("lists the shallower copy first when a name matches at two depths", async () => {
    await withTempTree(
      {
        "inputs/wanted.yaml": "top level",
        "inputs/a/wanted.yaml": "branch a",
        "inputs/b/wanted.yaml": "branch b",
      },
      async (root) => {
        const inputsDir = path.join(root, "inputs");
        // The level-0 copy is skipped as an exact hit only when the name is
        // plain, so a prefix whose own folder is absent forces all three into
        // the name-only search and into one ambiguous report.
        const error = await findAssetPath(
          inputsDir,
          "archive/wanted.yaml",
        ).catch((err) => err);
        const listed = error.message
          .split('Ambiguous "wanted.yaml": ')[1]
          .split(", ");
        expect(new Set(listed)).toEqual(
          new Set([
            path.join(inputsDir, "wanted.yaml"),
            path.join(inputsDir, "a", "wanted.yaml"),
            path.join(inputsDir, "b", "wanted.yaml"),
          ]),
        );
        // Folders level by level, so depth never climbs then falls: the copy
        // nearest the base heads the list, which is the one to move first.
        const depths = listed.map(
          (match) => path.relative(inputsDir, match).split(path.sep).length - 1,
        );
        expect(depths).toEqual([0, 1, 1]);
        expect(listed[0]).toBe(path.join(inputsDir, "wanted.yaml"));
      },
    );
  });

  it("reports what was searched when nothing matches", async () => {
    await withTempTree({ "inputs/present.yaml": "x" }, async (root) => {
      const inputsDir = path.join(root, "inputs");
      await expect(findAssetPath(inputsDir, "ghost.yaml")).rejects.toThrow(
        `No file "ghost.yaml" found under ${inputsDir}`,
      );
      // The base is reported resolved, so a relative base still names a
      // folder the caller can find.
      await expect(
        findAssetPath(path.relative(process.cwd(), inputsDir), "ghost.yaml"),
      ).rejects.toThrow(`found under ${inputsDir}`);
    });
  });

  it("names the base when COMFY_ASSETS_PATH is missing or is not a folder", async () => {
    await withTempTree({ "inputs/present.yaml": "x" }, async (root) => {
      // The commonest mistake: COMFY_ASSETS_PATH pointing at a folder that was
      // renamed or moved. loadConfig only derives the folders, so this message
      // is the whole report — it has to name the base the batch looked in.
      const absent = path.join(root, "absent");
      await expect(findAssetPath(absent, "wanted.yaml")).rejects.toThrow(
        `No file "wanted.yaml" found under ${absent}`,
      );
      // A base that is a plain file holds nothing below it either.
      const notAFolder = path.join(root, "present.yaml");
      await expect(findAssetPath(notAFolder, "wanted.yaml")).rejects.toThrow(
        `No file "wanted.yaml" found under ${notAFolder}`,
      );
    });
  });

  it("rejects names that are not a file below the base", async () => {
    await withTempTree({ "inputs/present.yaml": "x" }, async (root) => {
      const inputsDir = path.join(root, "inputs");
      for (const name of ["", "   ", null, undefined, "/vault/wanted.yaml"]) {
        await expect(findAssetPath(inputsDir, name)).rejects.toThrow(
          "Invalid asset name",
        );
      }
      // "../<name>" cannot point inside the base at all.
      await expect(findAssetPath(inputsDir, "../wanted.yaml")).rejects.toThrow(
        'Invalid asset name "../wanted.yaml"',
      );
      // "sub/../../<name>" does land outside the base, so it is refused too.
      const error = await findAssetPath(
        inputsDir,
        "sub/../../wanted.yaml",
      ).catch((err) => err);
      expect(error.message).toContain(
        'Asset name "sub/../../wanted.yaml" escapes',
      );
      expect(error.message).toContain(inputsDir);
    });
  });
});
