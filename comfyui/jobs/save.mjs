import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchImage } from "./comfy.mjs";
import { resolveDestDir } from "../utils/paths.mjs";
import { resolvePrefix, timestamp, destFileName } from "../utils/naming.mjs";
import { collectOutputImages } from "../utils/outputs.mjs";

export async function saveOutputs({
  server,
  destBaseDir,
  shouldKeepOriginals,
  input,
  historyEntry,
}) {
  const destDir = resolveDestDir(destBaseDir, input?.["output-folder"]);
  await mkdir(destDir, { recursive: true });

  const ts = timestamp();
  const prefix = resolvePrefix(input?.["filename-prefix"]);

  const saved = [];
  let n = 0;
  for (const img of collectOutputImages(historyEntry.outputs)) {
    const filename = destFileName({
      prefix,
      ts,
      index: n,
      ext: path.extname(img.filename) || ".png",
    });
    n++;
    const dest = path.join(destDir, filename);
    try {
      await writeFile(dest, await fetchImage(server, img));
      if (shouldKeepOriginals) console.log(`Saved: ${dest}`);
      saved.push({ filename, destDir });
    } catch (err) {
      console.error(`Could not save ${img.filename}: ${err.message}`);
    }
  }
  return saved;
}

export async function cleanupOriginals(saved) {
  const seen = new Set();

  for (const { destDir, filename } of saved) {
    const original = path.join(destDir, filename);
    const key = `${destDir}/${filename}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      await rm(original, { force: true });
    } catch (err) {
      console.error(`Could not delete ${original}: ${err.message}`);
    }
  }

  const emptyDirs = new Set();
  for (const { destDir } of saved) {
    if (emptyDirs.has(destDir)) continue;
    const entries = await readdir(destDir);
    if (entries.length === 0) {
      emptyDirs.add(destDir);
      try {
        await rm(destDir, { recursive: true, force: true });
      } catch (err) {
        console.error(
          `Could not delete empty directory ${destDir}: ${err.message}`,
        );
      }
    }
  }
}
