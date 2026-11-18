/**
 * Regenerate golden JSON files for e2e workflow building tests.
 *
 * This script mimics the exact seed sequence that the test suite uses:
 * each test runs in isolation (isolate: true), so the patched `Math.random`
 * restarts at the first seed for every test. Therefore every input here starts
 * from the same index 0 (see test/support/deterministic-seeds.mjs).
 *
 * The goldens it writes are Prettier-formatted, so `npm run format:check`
 * passes straight after regeneration: regenerate, run `npm run test`, review
 * the diff.
 */

import { readdir, rm, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { format, resolveConfig } from "prettier";
import { deterministicRandom } from "../../support/deterministic-seeds.mjs";
import { loadWorkflows } from "../../../comfyui/workflow-builder/workflow.mjs";

const FIXTURES_BASE = path.join(import.meta.dirname, "base-workflows");
const INPUTS_DIR = path.join(import.meta.dirname, "inputs");
const GOLDEN_DIR = path.join(import.meta.dirname, "golden");

const _origRandom = Math.random;

async function generateGoldenForInput(inputName, seedState) {
  Math.random = deterministicRandom(seedState, _origRandom);

  try {
    const workflows = await loadWorkflows(inputName, INPUTS_DIR, FIXTURES_BASE);
    return { ok: true, count: workflows.length, workflows };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    Math.random = _origRandom;
  }
}

/**
 * Write one golden in the committed style: Prettier-formatted JSON. The repo's
 * required QA gate is `npm run format:check`, so the generator cannot leave its
 * output as raw `JSON.stringify` or every regeneration breaks the suite's gate.
 */
async function writeGolden(baseName, outputs) {
  const goldenPath = path.join(GOLDEN_DIR, `${baseName}.json`);
  const config = await resolveConfig(goldenPath);
  const formatted = await format(`${JSON.stringify(outputs, null, 2)}\n`, {
    ...config,
    parser: "json",
    filepath: goldenPath,
  });
  await writeFile(goldenPath, formatted, "utf8");
  return goldenPath;
}

async function main() {
  try {
    await rm(GOLDEN_DIR, { recursive: true, force: true });
  } catch {
    // Golden dir may not exist yet — ignore
  }
  await mkdir(GOLDEN_DIR, { recursive: true });

  const inputs = (await readdir(INPUTS_DIR)).sort();

  console.log(`\n=== Golden file regeneration (per-test isolation) ===`);
  console.log(`Inputs dir:  ${INPUTS_DIR}`);
  console.log(`Golden dir:  ${GOLDEN_DIR}\n`);

  let success = 0;
  let failed = 0;

  for (const inputFile of inputs) {
    const baseName = inputFile.replace(/\.yaml$/, "");
    // Fresh counter per input: mirrors the suite resetting per test.
    const seedState = { count: 0 };
    const result = await generateGoldenForInput(baseName, seedState);

    if (result.ok) {
      const outputs = result.workflows.map((w) => ({
        workflow: w.workflow,
        input: w.input,
      }));
      const goldenPath = await writeGolden(baseName, outputs);
      console.log(
        `✓ ${inputFile} → ${result.count} workflow(s) → ${goldenPath}`,
      );
      success++;
    } else {
      console.log(`✗ ${inputFile} → ${result.error}`);
      failed++;
    }
  }

  console.log(`\n${success} succeeded, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
