/**
 * End-to-end tests for workflow building: YAML input → workflow JSON output.
 *
 * These tests read input YAML files from `inputs/`, run them through
 * `loadWorkflows()` using the fixture base workflows from `base-workflows/`
 * (checkpoint bases `full-base`, `minimal-base`, `minimal-no-clipskip`;
 * checkpoint-free UNETLoader bases `unet-base`, `unet-with-lora`,
 * `unet-with-shift` — mirrors of the production `example-unet-*` workflows),
 * and compare the result against pre-generated golden JSON files in `golden/`.
 *
 * Each test verifies that the workflow structure (node graph, inputs, overrides)
 * matches the expected golden file exactly.
 *
 * NOTE: These are happy-path tests only. Error/validation paths for invalid
 * inputs (bad YAML, missing fields, invalid tries/loras values) are covered
 * by the unit tests in `test/comfyui/workflow-builder/workflow.test.mjs`.
 *
 * See AGENTS.md → "ComfyUI workflow building tests" for guidance on keeping
 * these tests updated when workflow-building logic changes.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import { deterministicRandom } from "../../support/deterministic-seeds.mjs";
import { loadWorkflows } from "../../../comfyui/workflow-builder/workflow.mjs";

const FIXTURES_BASE = path.join(import.meta.dirname, "base-workflows");
const INPUTS_DIR = path.join(import.meta.dirname, "inputs");
const GOLDEN_DIR = path.join(import.meta.dirname, "golden");

/**
 * Helper that reads all YAML files from the inputs directory and returns
 * their basenames sorted alphabetically (matching golden file names).
 */
async function getInputFiles() {
  const allFiles = await readdir(INPUTS_DIR);
  return allFiles.filter((f) => f.endsWith(".yaml")).sort();
}

/**
 * Runs one input through the pipeline and reads its golden file. Used by the
 * feature-by-feature tests added after scenario 32; the older tests inline the
 * same two calls.
 */
async function loadWithGolden(baseName) {
  const workflows = await loadWorkflows(baseName, INPUTS_DIR, FIXTURES_BASE);
  const golden = JSON.parse(
    await readFile(path.join(GOLDEN_DIR, `${baseName}.json`), "utf8"),
  );
  return { workflows, golden };
}

// The input list drives the generated tests below, so it has to be read at
// collection time: a `beforeAll` hook runs only after the describe body has
// already been evaluated, which left both generated test loops empty.
const inputFiles = await getInputFiles();
const goldenBasenames = new Set(
  (await readdir(GOLDEN_DIR))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, "")),
);

// Patch Math.random for deterministic seeds across all tests. The seed array
// and its per-test allocation live in test/support/deterministic-seeds.mjs,
// which generate-goldens.mjs imports too — the two harnesses must draw the
// same values in the same order or regenerated goldens stop matching the
// suite. `beforeEach` restarts the counter, so every test begins at index 0
// exactly like the generator does for every input.
//
// If workflow.mjs changes the order of getRandomSeed() calls, regenerate the
// golden files (see AGENTS.md → "ComfyUI workflow building tests").
const seedState = { count: 0 };
const _origRandom = Math.random;
Math.random = deterministicRandom(seedState, _origRandom);

// Reset counter before each test
beforeEach(() => {
  seedState.count = 0;
});

describe("e2e workflow building: YAML input → workflow JSON", () => {
  // --- Golden file existence check ---
  test("has a golden file for every input YAML", () => {
    for (const inputFile of inputFiles) {
      const baseName = inputFile.replace(/\.yaml$/, "");
      expect(goldenBasenames.has(baseName)).toBe(true);
    }
  });

  // --- Golden file comparisons (one test per input) ---
  for (const inputFile of inputFiles) {
    const baseName = inputFile.replace(/\.yaml$/, "");

    test(`golden: ${baseName}`, async () => {
      const workflows = await loadWorkflows(
        baseName,
        INPUTS_DIR,
        FIXTURES_BASE,
      );
      const goldenPath = path.join(GOLDEN_DIR, `${baseName}.json`);
      const goldenText = await readFile(goldenPath, "utf8");
      const golden = JSON.parse(goldenText);
      expect(workflows).toEqual(golden);
    });
  }

  // --- Structural invariants ---
  for (const inputFile of inputFiles) {
    const baseName = inputFile.replace(/\.yaml$/, "");

    test(`${baseName}: required node structure`, async () => {
      const workflows = await loadWorkflows(
        baseName,
        INPUTS_DIR,
        FIXTURES_BASE,
      );
      const goldenPath = path.join(GOLDEN_DIR, `${baseName}.json`);
      const golden = JSON.parse(await readFile(goldenPath, "utf8"));

      expect(workflows.length).toBe(golden.length);

      for (let i = 0; i < workflows.length; i++) {
        const wf = workflows[i].workflow;

        // Must have a Sampler (KSampler) with required inputs
        const sampler = Object.values(wf).find(
          (node) => node?.class_type === "KSampler",
        );
        expect(sampler).toBeDefined();
        expect(sampler.inputs).toHaveProperty("seed");
        expect(sampler.inputs).toHaveProperty("steps");
        expect(sampler.inputs).toHaveProperty("cfg");

        // Must have SaveImage output node — skip this check for minimal-base
        // workflows (26-minimal-base, 27-minimal-steps-cfg) which intentionally
        // omit SaveImage, CLIP, and other nodes. The invariant is: every
        // workflow that *can* have a SaveImage must have one.
        const isMinimalBase =
          baseName === "26-minimal-base" || baseName === "27-minimal-steps-cfg";
        if (!isMinimalBase) {
          const saveImage = Object.values(wf).find(
            (node) => node?.class_type === "SaveImage",
          );
          expect(saveImage).toBeDefined();
        }
      }
    });
  }

  // --- Feature-by-feature verification ---
  test("01 no-modifications: structure matches base (except deterministic seed)", async () => {
    const workflows = await loadWorkflows(
      "01-no-modifications",
      INPUTS_DIR,
      FIXTURES_BASE,
    );
    const golden = JSON.parse(
      await readFile(path.join(GOLDEN_DIR, "01-no-modifications.json"), "utf8"),
    );

    expect(workflows).toHaveLength(1);
    expect(workflows).toEqual(golden);
    const wf = workflows[0].workflow;
    expect(Object.keys(wf)).toEqual(Object.keys(golden[0].workflow));
    expect(wf.PositiveCLIP_Base.inputs.text).toBe(
      "masterpiece, best quality, highres",
    );
    expect(wf.NegativeCLIP_Base.inputs.text).toBe(
      "lowres, bad anatomy, extra limbs",
    );
    expect(wf.Sampler.inputs.steps).toBe(20);
    expect(wf.Sampler.inputs.cfg).toBe(8);
    expect(wf.EmptyLatentImage.inputs.width).toBe(832);
    expect(wf.EmptyLatentImage.inputs.height).toBe(1216);
    expect(wf.Lora_1).toBeUndefined();
    expect(wf.SaveImage.inputs.filename_prefix).toBe("output");
  });

  test("04 multiple-prompts: three separate workflows with distinct prompts", async () => {
    const workflows = await loadWorkflows(
      "04-multiple-prompts",
      INPUTS_DIR,
      FIXTURES_BASE,
    );
    const golden = JSON.parse(
      await readFile(path.join(GOLDEN_DIR, "04-multiple-prompts.json"), "utf8"),
    );

    expect(workflows).toHaveLength(3);
    expect(workflows).toEqual(golden);
    const prompts = workflows.map(
      (w) => w.workflow.PositiveCLIP_Base.inputs.text,
    );
    expect(prompts).toContain(
      "masterpiece, best quality, highres, prompt A text",
    );
    expect(prompts).toContain(
      "masterpiece, best quality, highres, prompt B text",
    );
    expect(prompts).toContain(
      "masterpiece, best quality, highres, prompt C text",
    );
  });

  test("05 multi-part-prompt: multiple strings concatenated with commas", async () => {
    const workflows = await loadWorkflows(
      "05-multi-part-prompt",
      INPUTS_DIR,
      FIXTURES_BASE,
    );
    const golden = JSON.parse(
      await readFile(
        path.join(GOLDEN_DIR, "05-multi-part-prompt.json"),
        "utf8",
      ),
    );

    expect(workflows).toEqual(golden);
    const text = workflows[0].workflow.PositiveCLIP_Base.inputs.text;
    expect(text).toContain("part one");
    expect(text).toContain("part two");
    expect(text).toContain("part three");
  });

  test("06 negative-prompt: negative prompt appended", async () => {
    const workflows = await loadWorkflows(
      "06-negative-prompt",
      INPUTS_DIR,
      FIXTURES_BASE,
    );
    const golden = JSON.parse(
      await readFile(path.join(GOLDEN_DIR, "06-negative-prompt.json"), "utf8"),
    );

    expect(workflows).toEqual(golden);
    const neg = workflows[0].workflow.NegativeCLIP_Base.inputs.text;
    expect(neg).toContain("lowres, bad anatomy, extra limbs");
    expect(neg).toContain("ugly artifacts");
    expect(neg).toContain("bad lighting");
  });

  test("07 steps-cfg-override: sampler inputs updated", async () => {
    const workflows = await loadWorkflows(
      "07-steps-cfg-override",
      INPUTS_DIR,
      FIXTURES_BASE,
    );
    const golden = JSON.parse(
      await readFile(
        path.join(GOLDEN_DIR, "07-steps-cfg-override.json"),
        "utf8",
      ),
    );

    expect(workflows).toEqual(golden);
    expect(workflows[0].workflow.Sampler.inputs.steps).toBe(50);
    expect(workflows[0].workflow.Sampler.inputs.cfg).toBe(12.5);
  });

  test("08 size-override: both dimensions updated", async () => {
    const workflows = await loadWorkflows(
      "08-size-override",
      INPUTS_DIR,
      FIXTURES_BASE,
    );
    const golden = JSON.parse(
      await readFile(path.join(GOLDEN_DIR, "08-size-override.json"), "utf8"),
    );

    expect(workflows).toEqual(golden);
    expect(workflows[0].workflow.EmptyLatentImage.inputs.width).toBe(1024);
    expect(workflows[0].workflow.EmptyLatentImage.inputs.height).toBe(1024);
  });

  test("09 width-only-size: only width changed, height preserved", async () => {
    const workflows = await loadWorkflows(
      "09-width-only-size",
      INPUTS_DIR,
      FIXTURES_BASE,
    );
    const golden = JSON.parse(
      await readFile(path.join(GOLDEN_DIR, "09-width-only-size.json"), "utf8"),
    );

    expect(workflows).toEqual(golden);
    expect(workflows[0].workflow.EmptyLatentImage.inputs.width).toBe(768);
    expect(workflows[0].workflow.EmptyLatentImage.inputs.height).toBe(1216);
  });

  test("10 filename-prefix: SaveImage prefix updated", async () => {
    const workflows = await loadWorkflows(
      "10-filename-prefix",
      INPUTS_DIR,
      FIXTURES_BASE,
    );
    const golden = JSON.parse(
      await readFile(path.join(GOLDEN_DIR, "10-filename-prefix.json"), "utf8"),
    );

    expect(workflows).toEqual(golden);
    expect(workflows[0].workflow.SaveImage.inputs.filename_prefix).toBe(
      "my-custom-prefix",
    );
  });

  test("11 fixed-seed-tries1: seed is the specified value, not random", async () => {
    const workflows = await loadWorkflows(
      "11-fixed-seed-tries1",
      INPUTS_DIR,
      FIXTURES_BASE,
    );
    const golden = JSON.parse(
      await readFile(
        path.join(GOLDEN_DIR, "11-fixed-seed-tries1.json"),
        "utf8",
      ),
    );

    expect(workflows).toEqual(golden);
    expect(workflows[0].workflow.Sampler.inputs.seed).toBe(999999999);
  });

  test("12 tries-random-seed: each clone gets random seed, total tries=3", async () => {
    const workflows = await loadWorkflows(
      "12-tries-random-seed",
      INPUTS_DIR,
      FIXTURES_BASE,
    );
    const golden = JSON.parse(
      await readFile(
        path.join(GOLDEN_DIR, "12-tries-random-seed.json"),
        "utf8",
      ),
    );

    expect(workflows).toEqual(golden);
    expect(workflows).toHaveLength(3);
    const seeds = workflows.map((w) => w.workflow.Sampler.inputs.seed);
    expect(seeds[0]).not.toBe(695823221);
    expect(seeds[1]).not.toBe(695823221);
    expect(seeds[2]).not.toBe(695823221);
    expect(seeds[0]).not.toBe(seeds[1]);
    expect(seeds[1]).not.toBe(seeds[2]);
  });

  test("13 single-lora: chain inserted after checkpoint, rewired", async () => {
    const workflows = await loadWorkflows(
      "13-single-lora",
      INPUTS_DIR,
      FIXTURES_BASE,
    );
    const golden = JSON.parse(
      await readFile(path.join(GOLDEN_DIR, "13-single-lora.json"), "utf8"),
    );

    expect(workflows).toEqual(golden);
    const wf = workflows[0].workflow;
    expect(wf.Lora_1.inputs.lora_name).toBe("my-lora.safetensors");
    expect(wf.Lora_1.inputs.strength_model).toBe(0.7);
    expect(wf.Lora_1.inputs.strength_clip).toBe(0.7);
    expect(wf.ClipSkip_Base.inputs.clip).toEqual(["Lora_1", 1]);
    expect(wf.Sampler.inputs.model).toEqual(["Lora_1", 0]);
  });

  test("14 multi-lora: three-node chain, all rewired", async () => {
    const workflows = await loadWorkflows(
      "14-multi-lora",
      INPUTS_DIR,
      FIXTURES_BASE,
    );
    const golden = JSON.parse(
      await readFile(path.join(GOLDEN_DIR, "14-multi-lora.json"), "utf8"),
    );

    expect(workflows).toEqual(golden);
    const wf = workflows[0].workflow;
    expect(wf.Lora_1.inputs.model).toEqual(["CheckpointLoader_Base", 0]);
    expect(wf.Lora_2.inputs.model).toEqual(["Lora_1", 0]);
    expect(wf.Lora_3.inputs.model).toEqual(["Lora_2", 0]);
    expect(wf.ClipSkip_Base.inputs.clip).toEqual(["Lora_3", 1]);
    expect(wf.Sampler.inputs.model).toEqual(["Lora_3", 0]);
  });

  test("15 lora-per-prompt-override: entry loras replace parent", async () => {
    const workflows = await loadWorkflows(
      "15-lora-per-prompt-override",
      INPUTS_DIR,
      FIXTURES_BASE,
    );
    const golden = JSON.parse(
      await readFile(
        path.join(GOLDEN_DIR, "15-lora-per-prompt-override.json"),
        "utf8",
      ),
    );

    expect(workflows).toEqual(golden);
    expect(workflows).toHaveLength(2);
    expect(workflows[0].workflow.Lora_1.inputs.lora_name).toBe(
      "entry-lora.safetensors",
    );
    expect(workflows[0].workflow.Lora_2).toBeUndefined();
    // Second entry inherits the parent's single lora (no entry-level loras override)
    expect(workflows[1].workflow.Lora_1.inputs.lora_name).toBe(
      "parent-lora.safetensors",
    );
    expect(workflows[1].workflow.Lora_2).toBeUndefined();
  });

  test("16 clip-skip: stop_at_clip_layer updated to -1", async () => {
    const workflows = await loadWorkflows(
      "16-clip-skip",
      INPUTS_DIR,
      FIXTURES_BASE,
    );
    const golden = JSON.parse(
      await readFile(path.join(GOLDEN_DIR, "16-clip-skip.json"), "utf8"),
    );

    expect(workflows).toEqual(golden);
    expect(workflows[0].workflow.ClipSkip_Base.inputs.stop_at_clip_layer).toBe(
      -1,
    );
  });

  test("17 clip-skip-zero: clip-skip=0 works", async () => {
    const workflows = await loadWorkflows(
      "17-clip-skip-zero",
      INPUTS_DIR,
      FIXTURES_BASE,
    );
    const golden = JSON.parse(
      await readFile(path.join(GOLDEN_DIR, "17-clip-skip-zero.json"), "utf8"),
    );

    expect(workflows).toEqual(golden);
    expect(workflows[0].workflow.ClipSkip_Base.inputs.stop_at_clip_layer).toBe(
      0,
    );
  });

  test("18 brace-single-group: 2 variants from {red, blue}", async () => {
    const workflows = await loadWorkflows(
      "18-brace-single-group",
      INPUTS_DIR,
      FIXTURES_BASE,
    );
    const golden = JSON.parse(
      await readFile(
        path.join(GOLDEN_DIR, "18-brace-single-group.json"),
        "utf8",
      ),
    );

    expect(workflows).toEqual(golden);
    expect(workflows).toHaveLength(2);
    const texts = workflows.map(
      (w) => w.workflow.PositiveCLIP_Base.inputs.text,
    );
    expect(texts).toContain("masterpiece, best quality, highres, a red ball");
    expect(texts).toContain("masterpiece, best quality, highres, a blue ball");
  });

  test("19 brace-multi-group: 4 cartesian product variants", async () => {
    const workflows = await loadWorkflows(
      "19-brace-multi-group",
      INPUTS_DIR,
      FIXTURES_BASE,
    );
    const golden = JSON.parse(
      await readFile(
        path.join(GOLDEN_DIR, "19-brace-multi-group.json"),
        "utf8",
      ),
    );

    expect(workflows).toEqual(golden);
    expect(workflows).toHaveLength(4);
    const texts = workflows.map(
      (w) => w.workflow.PositiveCLIP_Base.inputs.text,
    );
    expect(texts).toContain("masterpiece, best quality, highres, a red ball");
    expect(texts).toContain("masterpiece, best quality, highres, a red cube");
    expect(texts).toContain("masterpiece, best quality, highres, a blue ball");
    expect(texts).toContain("masterpiece, best quality, highres, a blue cube");
  });

  test("20 brace-multi-entries: brace expansion + multiple prompt entries", async () => {
    const workflows = await loadWorkflows(
      "20-brace-multi-entries",
      INPUTS_DIR,
      FIXTURES_BASE,
    );
    const golden = JSON.parse(
      await readFile(
        path.join(GOLDEN_DIR, "20-brace-multi-entries.json"),
        "utf8",
      ),
    );

    expect(workflows).toEqual(golden);
    expect(workflows).toHaveLength(3); // 2 from brace + 1 plain
    const texts = workflows.map(
      (w) => w.workflow.PositiveCLIP_Base.inputs.text,
    );
    expect(texts).toContain("masterpiece, best quality, highres, red thing");
    expect(texts).toContain("masterpiece, best quality, highres, green thing");
    expect(texts).toContain("masterpiece, best quality, highres, blue thing");
  });

  test("21 per-prompt-seed: each prompt uses its own seed", async () => {
    const workflows = await loadWorkflows(
      "21-per-prompt-seed",
      INPUTS_DIR,
      FIXTURES_BASE,
    );
    const golden = JSON.parse(
      await readFile(path.join(GOLDEN_DIR, "21-per-prompt-seed.json"), "utf8"),
    );

    expect(workflows).toEqual(golden);
    expect(workflows).toHaveLength(2);
    expect(workflows[0].workflow.Sampler.inputs.seed).toBe(12345678);
    expect(workflows[1].workflow.Sampler.inputs.seed).toBe(87654321);
  });

  test("22 seed-random-tries1: explicit seed=random produces a random seed", async () => {
    const workflows = await loadWorkflows(
      "22-seed-random-tries1",
      INPUTS_DIR,
      FIXTURES_BASE,
    );
    const golden = JSON.parse(
      await readFile(
        path.join(GOLDEN_DIR, "22-seed-random-tries1.json"),
        "utf8",
      ),
    );

    expect(workflows).toEqual(golden);
    expect(workflows[0].workflow.Sampler.inputs.seed).not.toBe(695823221);
  });

  test("23 combined-lora-clip-skip-size: all features together", async () => {
    const workflows = await loadWorkflows(
      "23-combined-lora-clip-skip-size",
      INPUTS_DIR,
      FIXTURES_BASE,
    );
    const golden = JSON.parse(
      await readFile(
        path.join(GOLDEN_DIR, "23-combined-lora-clip-skip-size.json"),
        "utf8",
      ),
    );

    expect(workflows).toEqual(golden);
    const wf = workflows[0].workflow;
    expect(wf.Lora_1.inputs.lora_name).toBe("style-lora.safetensors");
    expect(wf.Lora_1.inputs.strength_model).toBe(0.6);
    expect(wf.ClipSkip_Base.inputs.stop_at_clip_layer).toBe(-2);
    expect(wf.EmptyLatentImage.inputs.width).toBe(768);
    expect(wf.EmptyLatentImage.inputs.height).toBe(1024);
  });

  test("24 combined-prompt-negative: prompt + negative + steps + cfg + size", async () => {
    const workflows = await loadWorkflows(
      "24-combined-prompt-negative",
      INPUTS_DIR,
      FIXTURES_BASE,
    );
    const golden = JSON.parse(
      await readFile(
        path.join(GOLDEN_DIR, "24-combined-prompt-negative.json"),
        "utf8",
      ),
    );

    expect(workflows).toEqual(golden);
    const wf = workflows[0].workflow;
    expect(wf.Sampler.inputs.steps).toBe(30);
    expect(wf.Sampler.inputs.cfg).toBe(10);
    expect(wf.EmptyLatentImage.inputs.width).toBe(640);
    expect(wf.EmptyLatentImage.inputs.height).toBe(960);
    expect(wf.PositiveCLIP_Base.inputs.text).toContain("positive text");
    expect(wf.NegativeCLIP_Base.inputs.text).toContain("negative text");
  });

  test("25 multi-item: multiple top-level items produce multiple workflows", async () => {
    const workflows = await loadWorkflows(
      "25-multi-item",
      INPUTS_DIR,
      FIXTURES_BASE,
    );
    const golden = JSON.parse(
      await readFile(path.join(GOLDEN_DIR, "25-multi-item.json"), "utf8"),
    );

    expect(workflows).toEqual(golden);
    expect(workflows).toHaveLength(2);
    expect(workflows[0].workflow.PositiveCLIP_Base.inputs.text).toContain(
      "item one",
    );
    expect(workflows[1].workflow.PositiveCLIP_Base.inputs.text).toContain(
      "item two",
    );
  });

  test("26 minimal-base: workflow without SaveImage", async () => {
    const workflows = await loadWorkflows(
      "26-minimal-base",
      INPUTS_DIR,
      FIXTURES_BASE,
    );
    const golden = JSON.parse(
      await readFile(path.join(GOLDEN_DIR, "26-minimal-base.json"), "utf8"),
    );

    expect(workflows).toEqual(golden);
    const wf = workflows[0].workflow;
    expect(wf.ClipSkip_Base).toBeUndefined();
    expect(wf.PositiveCLIP_Base).toBeDefined();
    expect(wf.NegativeCLIP_Base).toBeDefined();
    expect(wf.SaveImage).toBeUndefined();
    expect(wf.Lora_1).toBeUndefined();
    expect(wf.Sampler.inputs.model).toEqual(["CheckpointLoader_Base", 0]);
  });

  test("27 minimal-steps-cfg: overrides work on minimal base", async () => {
    const workflows = await loadWorkflows(
      "27-minimal-steps-cfg",
      INPUTS_DIR,
      FIXTURES_BASE,
    );
    const golden = JSON.parse(
      await readFile(
        path.join(GOLDEN_DIR, "27-minimal-steps-cfg.json"),
        "utf8",
      ),
    );

    expect(workflows).toEqual(golden);
    expect(workflows[0].workflow.Sampler.inputs.steps).toBe(25);
    expect(workflows[0].workflow.Sampler.inputs.cfg).toBe(9);
  });

  test("28 per-prompt-clip-skip: entry-level overrides parent", async () => {
    const workflows = await loadWorkflows(
      "28-per-prompt-clip-skip",
      INPUTS_DIR,
      FIXTURES_BASE,
    );
    const golden = JSON.parse(
      await readFile(
        path.join(GOLDEN_DIR, "28-per-prompt-clip-skip.json"),
        "utf8",
      ),
    );

    expect(workflows).toEqual(golden);
    expect(workflows).toHaveLength(2);
    expect(workflows[0].workflow.ClipSkip_Base.inputs.stop_at_clip_layer).toBe(
      -1,
    );
    expect(workflows[1].workflow.ClipSkip_Base.inputs.stop_at_clip_layer).toBe(
      -3,
    );
  });

  test("29 per-prompt-tries: different tries per prompt", async () => {
    const workflows = await loadWorkflows(
      "29-per-prompt-tries",
      INPUTS_DIR,
      FIXTURES_BASE,
    );
    const golden = JSON.parse(
      await readFile(path.join(GOLDEN_DIR, "29-per-prompt-tries.json"), "utf8"),
    );

    expect(workflows).toEqual(golden);
    expect(workflows).toHaveLength(3); // 2 from first entry (tries=2) + 1 from second (tries=1)
    expect(workflows[0].input.tries).toBe(2);
    expect(workflows[1].input.tries).toBe(2);
    expect(workflows[2].input.tries).toBe(1);
    // All have random seeds (tries > 1 triggers randomization)
    expect(workflows[0].workflow.Sampler.inputs.seed).not.toBe(695823221);
    expect(workflows[1].workflow.Sampler.inputs.seed).not.toBe(695823221);
    expect(workflows[2].workflow.Sampler.inputs.seed).not.toBe(695823221);
  });

  test("30 all-overrides: comprehensive single workflow with every feature", async () => {
    const workflows = await loadWorkflows(
      "30-all-overrides",
      INPUTS_DIR,
      FIXTURES_BASE,
    );
    const golden = JSON.parse(
      await readFile(path.join(GOLDEN_DIR, "30-all-overrides.json"), "utf8"),
    );

    expect(workflows).toEqual(golden);
    expect(workflows).toHaveLength(1);
    const wf = workflows[0].workflow;
    expect(wf.Sampler.inputs.steps).toBe(40);
    expect(wf.Sampler.inputs.cfg).toBe(15);
    expect(wf.Sampler.inputs.seed).toBe(111222333);
    expect(wf.EmptyLatentImage.inputs.width).toBe(1152);
    expect(wf.EmptyLatentImage.inputs.height).toBe(896);
    expect(wf.SaveImage.inputs.filename_prefix).toBe("comprehensive-test");
    expect(wf.Lora_1.inputs.lora_name).toBe("style.safetensors");
    expect(wf.Lora_1.inputs.strength_model).toBe(0.9);
    expect(wf.ClipSkip_Base.inputs.stop_at_clip_layer).toBe(-1);
    expect(wf.PositiveCLIP_Base.inputs.text).toContain("masterful work");
    expect(wf.PositiveCLIP_Base.inputs.text).toContain("stunning detail");
    expect(wf.NegativeCLIP_Base.inputs.text).toContain("blurry");
    expect(wf.NegativeCLIP_Base.inputs.text).toContain("low quality");
  });

  test("31 clip-skip-create: ClipSkip_Base created on workflow that lacks it", async () => {
    const workflows = await loadWorkflows(
      "31-clip-skip-create",
      INPUTS_DIR,
      FIXTURES_BASE,
    );
    const golden = JSON.parse(
      await readFile(path.join(GOLDEN_DIR, "31-clip-skip-create.json"), "utf8"),
    );

    expect(workflows).toEqual(golden);
    expect(workflows).toHaveLength(1);
    const wf = workflows[0].workflow;
    // ClipSkip_Base should be created and inserted after the checkpoint
    expect(wf.ClipSkip_Base).toBeDefined();
    expect(wf.ClipSkip_Base.class_type).toBe("CLIPSetLastLayer");
    expect(wf.ClipSkip_Base.inputs.clip).toEqual(["CheckpointLoader_Base", 1]);
    expect(wf.ClipSkip_Base.inputs.stop_at_clip_layer).toBe(-2);
    // Positive/negative clips should be rewired to point to ClipSkip_Base
    expect(wf.PositiveCLIP_Base.inputs.clip).toEqual(["ClipSkip_Base", 0]);
    expect(wf.NegativeCLIP_Base.inputs.clip).toEqual(["ClipSkip_Base", 0]);
    // PositiveCLIP_Base should have the prompt appended
    expect(wf.PositiveCLIP_Base.inputs.text).toContain(
      "masterpiece, best quality",
    );
    expect(wf.PositiveCLIP_Base.inputs.text).toContain("clip skip created");
  });

  // --- UNETLoader (checkpoint-free) bases: LoRA chains and complex overrides ---

  test("33 unet-single-prompt: prompt lands on the empty base CLIP, loader keeps its link", async () => {
    const { workflows, golden } = await loadWithGolden("33-unet-single-prompt");

    expect(workflows).toHaveLength(1);
    const wf = workflows[0].workflow;
    // Key order is compared explicitly because `toEqual` ignores it — the
    // goldens pin where every generated node is spliced into the dict.
    expect(Object.keys(wf)).toEqual(Object.keys(golden[0].workflow));
    // A Krea2-style base carries no checkpoint: UNETLoader + CLIPLoader + VAELoader.
    expect(wf.Sampler.inputs.model).toEqual(["UNETLoader_Base", 0]);
    expect(wf.Sampler.inputs.seed).not.toBe(704601);
    // The base CLIP text is empty, so the override is the prompt itself.
    expect(wf.PositiveCLIP_Base.inputs.text).toBe("a red fox in autumn light");
    expect(wf.NegativeCLIP_Base.inputs.text).toBe("");
    // Omitted overrides keep the base workflow's own defaults.
    expect(wf.Sampler.inputs.steps).toBe(8);
    expect(wf.Sampler.inputs.cfg).toBe(1);
    expect(wf.Sampler.inputs.sampler_name).toBe("er_sde");
    expect(wf.Sampler.inputs.scheduler).toBe("simple");
    expect(wf.EmptyLatentImage.inputs.width).toBe(1024);
    expect(wf.EmptyLatentImage.inputs.height).toBe(1536);
    expect(wf.SaveImage.inputs.filename_prefix).toBe("krea2");
    expect(wf.Lora_1).toBeUndefined();
  });

  test("34 unet-single-lora: LoraLoaderModelOnly node, clip and VAE links untouched", async () => {
    const { workflows, golden } = await loadWithGolden("34-unet-single-lora");

    const wf = workflows[0].workflow;
    // Key order is compared explicitly because `toEqual` ignores it: the
    // generated LoRA must sit immediately after the loader.
    expect(Object.keys(wf)).toEqual(Object.keys(golden[0].workflow));
    expect(wf.Lora_1).toEqual({
      class_type: "LoraLoaderModelOnly",
      inputs: {
        lora_name: "unet-style-lora.safetensors",
        strength_model: 0.7,
        model: ["UNETLoader_Base", 0],
      },
    });
    // The inputs key order is load-bearing in the golden files: a model-only
    // LoRA stores its settings before the model link, unlike LoraLoader.
    expect(Object.keys(wf.Lora_1.inputs)).toEqual([
      "lora_name",
      "strength_model",
      "model",
    ]);
    expect(wf.Lora_1.inputs).not.toHaveProperty("clip");
    expect(wf.Lora_1.inputs).not.toHaveProperty("strength_clip");
    expect(wf.Sampler.inputs.model).toEqual(["Lora_1", 0]);
    // A model-only LoRA never touches the text encoder or the VAE loader.
    expect(wf.PositiveCLIP_Base.inputs.clip).toEqual(["CLIPLoader_Base", 0]);
    expect(wf.NegativeCLIP_Base.inputs.clip).toEqual(["CLIPLoader_Base", 0]);
    expect(wf.VAEDecode_1.inputs.vae).toEqual(["VAELoader_Base", 0]);
  });

  test("35 unet-three-lora-chain: model-only nodes chained to the tip", async () => {
    const { workflows, golden } = await loadWithGolden(
      "35-unet-three-lora-chain",
    );

    const wf = workflows[0].workflow;
    // Key order is compared explicitly because `toEqual` ignores it: the
    // chain is spliced in right after the loader, in request order.
    expect(Object.keys(wf)).toEqual(Object.keys(golden[0].workflow));
    expect(wf.Lora_1.inputs.model).toEqual(["UNETLoader_Base", 0]);
    expect(wf.Lora_2.inputs.model).toEqual(["Lora_1", 0]);
    expect(wf.Lora_3.inputs.model).toEqual(["Lora_2", 0]);
    expect(wf.Sampler.inputs.model).toEqual(["Lora_3", 0]);
    // `strength` maps to strength_model only on a model-only base, and every
    // node keeps the model-only key order.
    const chain = [
      ["unet-first-lora.safetensors", 1],
      ["unet-second-lora.safetensors", 0.5],
      ["unet-third-lora.safetensors", 0.25],
    ];
    for (const [index, [name, strength]] of chain.entries()) {
      const label = `Lora_${index + 1}`;
      expect(wf[label].class_type).toBe("LoraLoaderModelOnly");
      expect(Object.keys(wf[label].inputs)).toEqual([
        "lora_name",
        "strength_model",
        "model",
      ]);
      expect(wf[label].inputs.lora_name).toBe(name);
      expect(wf[label].inputs.strength_model).toBe(strength);
      expect(wf[label].inputs).not.toHaveProperty("strength_clip");
    }
    // A model-only chain leaves the text encoder and the VAE alone.
    expect(wf.PositiveCLIP_Base.inputs.clip).toEqual(["CLIPLoader_Base", 0]);
    expect(wf.VAEDecode_1.inputs.vae).toEqual(["VAELoader_Base", 0]);
  });

  test("36 unet-lora-on-baked-lora-base: requested chain lands before the baked node", async () => {
    const { workflows, golden } = await loadWithGolden(
      "36-unet-lora-on-baked-lora-base",
    );

    const wf = workflows[0].workflow;
    // Key order is compared explicitly because `toEqual` ignores it: the
    // requested chain lands after the loader, ahead of the base's baked LoRA.
    expect(Object.keys(wf)).toEqual(Object.keys(golden[0].workflow));
    expect(wf.Lora_1.inputs.model).toEqual(["UNETLoader_Base", 0]);
    expect(wf.Lora_2.inputs.model).toEqual(["Lora_1", 0]);
    expect(wf.Lora_2.inputs.strength_model).toBe(0.4);
    // The base's baked LoRA is itself a consumer of the loader, so its own
    // link moves onto the requested tip:
    // UNETLoader_Base -> Lora_1 -> Lora_2 -> LoraLoader_1 -> Sampler.
    expect(wf.LoraLoader_1.inputs.model).toEqual(["Lora_2", 0]);
    // Its name and baked strength survive untouched — no input key tunes it.
    expect(wf.LoraLoader_1.inputs.lora_name).toBe("<LoRA name>.safetensors");
    expect(wf.LoraLoader_1.inputs.strength_model).toBe(0.8);
    expect(wf.Sampler.inputs.model).toEqual(["LoraLoader_1", 0]);
    expect(wf.Lora_1.inputs.lora_name).toBe("requested-lora-a.safetensors");
    expect(wf.PositiveCLIP_Base.inputs.clip).toEqual(["CLIPLoader_Base", 0]);
  });

  test("37 unet-lora-on-shift-base: shift node rewired, sampler keeps reading it", async () => {
    const { workflows, golden } = await loadWithGolden(
      "37-unet-lora-on-shift-base",
    );

    const wf = workflows[0].workflow;
    // Key order is compared explicitly because `toEqual` ignores it: the chain
    // is spliced in between the loader and the shift node.
    expect(Object.keys(wf)).toEqual(Object.keys(golden[0].workflow));
    // The shift node is a consumer of the loader, so it moves to the chain tip…
    expect(wf.ModelSamplingAuraFlow.inputs.model).toEqual(["Lora_2", 0]);
    // …and the sampler keeps reading the shift node, so the shift still applies.
    expect(wf.Sampler.inputs.model).toEqual(["ModelSamplingAuraFlow", 0]);
    expect(wf.ModelSamplingAuraFlow.inputs.shift).toBe(5);
    expect(wf.ModelSamplingAuraFlow.inputs.sampling).toBe("flow");
    expect(wf.Lora_1.inputs.model).toEqual(["UNETLoader_Base", 0]);
    expect(wf.Lora_2.inputs.model).toEqual(["Lora_1", 0]);
    expect(wf.Lora_1.inputs.strength_model).toBe(0.9);
    expect(wf.Lora_2.inputs.strength_model).toBe(0.3);
    expect(wf.Lora_2.inputs).not.toHaveProperty("clip");
    expect(wf.PositiveCLIP_Base.inputs.clip).toEqual(["CLIPLoader_Base", 0]);
    expect(wf.VAEDecode_1.inputs.vae).toEqual(["VAELoader_Base", 0]);
  });

  test("38 unet-complex-overrides: prompt + negative + sampler + size + chain, tries=2", async () => {
    const { workflows, golden } = await loadWithGolden(
      "38-unet-complex-overrides",
    );

    expect(workflows).toHaveLength(2);
    const clones = workflows.map((job) => job.workflow);
    for (const [index, wf] of clones.entries()) {
      // Key order is compared explicitly because `toEqual` ignores it: every
      // clone gets its own chain spliced in right after the loader.
      expect(Object.keys(wf)).toEqual(Object.keys(golden[index].workflow));
      expect(wf.Sampler.inputs.steps).toBe(28);
      expect(wf.Sampler.inputs.cfg).toBe(3.5);
      expect(wf.Sampler.inputs.sampler_name).toBe("dpmpp_2m");
      expect(wf.Sampler.inputs.scheduler).toBe("karras");
      expect(wf.EmptyLatentImage.inputs.width).toBe(896);
      expect(wf.EmptyLatentImage.inputs.height).toBe(1152);
      expect(wf.SaveImage.inputs.filename_prefix).toBe("unet-complex");
      expect(wf.PositiveCLIP_Base.inputs.text).toBe(
        "unet base with every override",
      );
      expect(wf.NegativeCLIP_Base.inputs.text).toBe("blurry, low quality");
      // CLIP text nodes keep reading the standalone CLIPLoader — a model-only
      // LoRA chain rewires the model output only.
      expect(wf.Sampler.inputs.positive).toEqual(["PositiveCLIP_Base", 0]);
      expect(wf.Sampler.inputs.negative).toEqual(["NegativeCLIP_Base", 0]);
      expect(wf.Lora_1.inputs.model).toEqual(["UNETLoader_Base", 0]);
      expect(wf.Lora_2.inputs.model).toEqual(["Lora_1", 0]);
      expect(wf.Sampler.inputs.model).toEqual(["Lora_2", 0]);
    }
    // tries > 1 always randomizes: the block seed 515151 is dropped, and every
    // clone gets its own independently built chain.
    expect(clones[0].Lora_1).not.toBe(clones[1].Lora_1);
    expect(clones[0].Sampler.inputs.seed).not.toBe(
      clones[1].Sampler.inputs.seed,
    );
    expect(clones[0].Sampler.inputs.seed).not.toBe(515151);
  });

  test("39 unet-lora-per-prompt-override: entry replaces, sibling inherits", async () => {
    const { workflows, golden } = await loadWithGolden(
      "39-unet-lora-per-prompt-override",
    );

    expect(workflows).toHaveLength(2);
    // Key order is compared explicitly because `toEqual` ignores it. The two
    // entries have different chain lengths, so their dicts differ by design.
    const entryWf = workflows[0].workflow;
    expect(Object.keys(entryWf)).toEqual(Object.keys(golden[0].workflow));
    expect(entryWf.Lora_1.class_type).toBe("LoraLoaderModelOnly");
    expect(entryWf.Lora_1.inputs.lora_name).toBe("entry-unet-lora.safetensors");
    expect(entryWf.Lora_1.inputs.strength_model).toBe(0.45);
    expect(entryWf.Lora_2).toBeUndefined();
    expect(entryWf.Sampler.inputs.model).toEqual(["Lora_1", 0]);
    // The other prompt entry keeps the block's two-node chain untouched.
    const inheritWf = workflows[1].workflow;
    expect(Object.keys(inheritWf)).toEqual(Object.keys(golden[1].workflow));
    expect(inheritWf.Lora_1.inputs.lora_name).toBe(
      "parent-unet-lora-a.safetensors",
    );
    expect(inheritWf.Lora_2.inputs.lora_name).toBe(
      "parent-unet-lora-b.safetensors",
    );
    expect(inheritWf.Sampler.inputs.model).toEqual(["Lora_2", 0]);
    expect(inheritWf.PositiveCLIP_Base.inputs.clip).toEqual([
      "CLIPLoader_Base",
      0,
    ]);
  });

  test("40 unet-brace-variants-with-loras: every variant gets its own wired chain", async () => {
    const { workflows, golden } = await loadWithGolden(
      "40-unet-brace-variants-with-loras",
    );

    expect(workflows).toHaveLength(4);
    expect(
      workflows.map((job) => job.workflow.PositiveCLIP_Base.inputs.text),
    ).toEqual([
      "a red car on a mountain road",
      "a red car on a beach road",
      "a blue car on a mountain road",
      "a blue car on a beach road",
    ]);
    // Brace expansion produced 4 variants, so the block seed 777 is dropped
    // from every variant and each build draws its own random seed.
    const seeds = workflows.map((job) => job.workflow.Sampler.inputs.seed);
    expect(new Set(seeds).size).toBe(4);
    for (const seed of seeds) {
      expect(seed).not.toBe(777);
    }
    for (const [index, job] of workflows.entries()) {
      expect(job.input.seed).toBeUndefined();
      const wf = job.workflow;
      // Key order is compared explicitly because `toEqual` ignores it: every
      // variant gets its own chain between the loader and the shift node.
      expect(Object.keys(wf)).toEqual(Object.keys(golden[index].workflow));
      expect(wf.Lora_1.class_type).toBe("LoraLoaderModelOnly");
      expect(wf.Lora_1.inputs.model).toEqual(["UNETLoader_Base", 0]);
      expect(wf.ModelSamplingAuraFlow.inputs.model).toEqual(["Lora_1", 0]);
      expect(wf.Sampler.inputs.model).toEqual(["ModelSamplingAuraFlow", 0]);
    }
    // Each variant rebuilt its own chain — the node objects are not shared.
    expect(workflows[0].workflow.Lora_1).not.toBe(workflows[1].workflow.Lora_1);
  });
});
