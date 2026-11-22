import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { validateJobData } from "./validation.mjs";
import { expandPrompts } from "./prompts.mjs";
import { applyOverrides } from "./overrides.mjs";
import {
  REPO_ASSET_DIRS,
  findAssetPath,
  assetFileName,
} from "../utils/assets.mjs";

// Input YAML + base workflow JSONs are located by file name under the asset
// folders, so their paths come from a search rather than from a join.
async function loadInputData(yamlPath) {
  const text = await readFile(yamlPath, "utf8");
  try {
    return parse(text);
  } catch (err) {
    throw new Error(`Invalid YAML in ${yamlPath}: ${err.message}`, {
      cause: err,
    });
  }
}

// Reads each base workflow JSON at most once per run, whatever depth it sits at.
async function loadBaseWorkflow(item, workflowsDir, cache) {
  const baseName = item?.["base-workflow"];
  if (!baseName) {
    throw new Error(
      `Input item is missing "base-workflow": ${JSON.stringify(item)}`,
    );
  }
  const fileName = assetFileName(baseName, ".json");
  if (!cache.has(fileName)) {
    const basePath = await findAssetPath(workflowsDir, fileName);
    cache.set(fileName, JSON.parse(await readFile(basePath, "utf8")));
  }
  return cache.get(fileName);
}

export async function loadWorkflows(
  name,
  inputsDir = REPO_ASSET_DIRS.inputsDir,
  workflowsDir = REPO_ASSET_DIRS.workflowsDir,
) {
  const yamlPath = await findAssetPath(inputsDir, assetFileName(name, ".yaml"));
  const data = await loadInputData(yamlPath);
  validateJobData(data);

  const items = expandPrompts(
    data == null ? [] : Array.isArray(data) ? data : [data],
  );
  const baseCache = new Map();
  const workflows = [];

  for (const item of items) {
    const base = await loadBaseWorkflow(item, workflowsDir, baseCache);
    const tries = item?.tries == null ? 1 : Number(item.tries);
    for (let t = 0; t < tries; t++) {
      const workflow = structuredClone(base);
      applyOverrides(workflow, item, tries > 1);
      workflows.push({ workflow, input: item });
    }
  }

  return workflows;
}

export async function requireWorkflows(
  name,
  inputsDir = REPO_ASSET_DIRS.inputsDir,
  workflowsDir = REPO_ASSET_DIRS.workflowsDir,
) {
  let workflows;
  try {
    workflows = await loadWorkflows(name, inputsDir, workflowsDir);
  } catch (err) {
    // The messages below carry the searched base and the resolved path, so the
    // input name is all that is added here.
    console.error(`Could not load input "${name}": ${err.message}`);
    process.exit(1);
  }

  if (workflows.length === 0) {
    console.warn(`Input "${name}" has no workflows to run, nothing to do.`);
    process.exit(0);
  }

  return workflows;
}
