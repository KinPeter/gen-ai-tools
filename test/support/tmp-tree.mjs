import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

/**
 * Runs `callback` against a throwaway tree of files in a temp folder and
 * removes the tree afterwards, so tests never touch repository files.
 *
 * Keys are `<sub>/<file>` paths below the temp root and values their contents;
 * the parent folders are created on the way. Symlinks and permission changes
 * are left to the callback because they have to happen inside the tree.
 * Returns whatever the callback returns; teardown also runs when it throws.
 *
 * @param {Record<string, string>} files
 * @param {(root: string) => Promise<unknown>} callback
 * @param {string} prefix - mkdtemp prefix. The default is the generic name
 *   every test file shares; a caller may pass its own so a leftover temp folder
 *   from a crashed run still says which file made it.
 */
export async function withTempTree(files, callback, prefix = "gen-ai-tree-") {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  try {
    for (const [relative, content] of Object.entries(files)) {
      const target = path.join(root, relative);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content, "utf8");
    }
    return await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
