import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFinalLogDataFromWorkflow } from "../../../comfyui/workflow-builder/utils.mjs";
import { loadConfig } from "../../../comfyui/jobs/config.mjs";
import {
  loadWorkflows,
  requireWorkflows,
} from "../../../comfyui/workflow-builder/workflow.mjs";
import { withTempTree } from "../../support/tmp-tree.mjs";

// The base-workflow cache is only visible from the outside through how often
// the file is opened, so readFile is wrapped here and records what it was asked
// for. Every call still goes through to the real fs, so the temp trees in this
// file keep working.
const readLog = vi.hoisted(() => ({ paths: [] }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readFile: (...args) => {
      readLog.paths.push(String(args[0]));
      return actual.readFile(...args);
    },
  };
});

// loadConfig's pod-state read is mocked so the asset-base test can drive the
// real config → asset folders → asset lookup chain with no runpod state file.
const podState = vi.hoisted(() => ({ active: null }));
vi.mock("../../../runpod/state.mjs", () => ({
  readActivePod: vi.fn(async () => podState.active),
}));

// The read log is shared across this whole file, so every test counts only its
// own opens instead of the history of the tests before it.
beforeEach(() => {
  readLog.paths.length = 0;
});

// A base workflow is enough for the tests below when its sampler can be found:
// overrides land on the KSampler and the latent image, nothing else is read.
const BASE_JSON = JSON.stringify({
  CheckpointLoader_Base: {
    class_type: "CheckpointLoaderSimple",
    inputs: { ckpt_name: "base-model.safetensors" },
  },
  PositiveCLIP_Base: {
    class_type: "CLIPTextEncode",
    inputs: {
      clip: ["CLIPLoader_Base", 0],
      text: "",
    },
  },
  NegativeCLIP_Base: {
    class_type: "CLIPTextEncode",
    inputs: {
      clip: ["CLIPLoader_Base", 0],
      text: "",
    },
  },
  Sampler: {
    class_type: "KSampler",
    inputs: {
      model: ["CheckpointLoader_Base", 0],
      seed: 42,
      steps: 10,
      cfg: 7,
      sampler_name: "euler",
      scheduler: "normal",
      positive: ["PositiveCLIP_Base", 1],
      negative: ["NegativeCLIP_Base", 1],
      latent_image: ["EmptyLatentImage", 0],
      denoise: 1,
    },
  },
  EmptyLatentImage: {
    class_type: "EmptyLatentImage",
    inputs: { width: 512, height: 512, batch_size: 1 },
  },
});

function getFinalPositivePrompt(workflow) {
  return getFinalLogDataFromWorkflow(workflow).positivePrompt;
}

// Every fixture gets its own throwaway temp "inputs" tree (injected into
// loadWorkflows/requireWorkflows), so tests never touch real
// comfyui/inputs data and work in a clean checkout.
async function withInput(text, callback, subdir = "") {
  const root = await mkdtemp(path.join(tmpdir(), "comfy-inputs-"));
  const inputsDir = path.join(root, "inputs");
  const dir = subdir ? path.join(inputsDir, ...subdir.split("/")) : inputsDir;
  await mkdir(dir, { recursive: true });
  const name = `coverage-${randomUUID()}`;
  await writeFile(path.join(dir, `${name}.yaml`), text);
  try {
    return await callback(subdir ? `${subdir}/${name}` : name, inputsDir);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("workflow expansion", () => {
  it("loads inputs from a configurable base, including archive subfolders", async () => {
    await withInput(
      "base-workflow: example-base-workflow\nprompts: [{prompt: [moved]}]\n",
      async (name, inputsDir) => {
        const jobs = await loadWorkflows(name, inputsDir);
        expect(getFinalPositivePrompt(jobs[0].workflow)).toContain("moved");
      },
    );
    await withInput(
      "base-workflow: example-base-workflow\nprompts: [{prompt: [archived]}]\n",
      async (name, inputsDir) => {
        const jobs = await loadWorkflows(name, inputsDir);
        expect(getFinalPositivePrompt(jobs[0].workflow)).toContain("archived");
      },
      "archive",
    );
  });

  it("rejects missing input files", async () => {
    await expect(loadWorkflows("does-not-exist")).rejects.toThrow();
  });

  it("reports missing and empty workflow input through the CLI helper", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`exit ${code}`);
    });
    await expect(requireWorkflows("does-not-exist")).rejects.toThrow("exit 1");
    // The message names the input the batch was asked for and the asset base
    // it searched, not a guessed file path.
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('Could not load input "does-not-exist": '),
    );
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('No file "does-not-exist.yaml" found under'),
    );
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining(path.join("comfyui", "inputs")),
    );
    await withInput("", async (name, inputsDir) => {
      await expect(requireWorkflows(name, inputsDir)).rejects.toThrow("exit 0");
      expect(warn).toHaveBeenCalledWith(
        `Input "${name}" has no workflows to run, nothing to do.`,
      );
    });
    expect(exit).toHaveBeenCalledWith(0);
  });
});

// Inputs and base workflows are located by file name under the asset folders,
// so their depth is free, a qualified name still points where it says, and a
// base file is opened once per run however many items ask for it.
describe("asset lookup while building jobs", () => {
  function baseWithSteps(steps) {
    const base = JSON.parse(BASE_JSON);
    base.Sampler.inputs.steps = steps;
    return JSON.stringify(base);
  }

  it("finds a base workflow by name at depth and opens it once per run", async () => {
    await withTempTree(
      {
        "workflows/archive/deep/deep-base.json": BASE_JSON,
        "inputs/two-items.yaml":
          "- base-workflow: deep-base\n  prompts: [{prompt: [first]}]\n" +
          "- base-workflow: deep-base.json\n  prompts: [{prompt: [second], steps: 21}]\n",
      },
      async (root) => {
        const jobs = await loadWorkflows(
          "two-items",
          path.join(root, "inputs"),
          path.join(root, "workflows"),
        );
        expect(jobs).toHaveLength(2);
        // The two items name the same base, once with and once without the
        // extension, and it sits three folders down: one read is the cache.
        expect(
          readLog.paths.filter((read) => read.endsWith("deep-base.json")),
        ).toEqual([
          path.join(root, "workflows", "archive", "deep", "deep-base.json"),
        ]);
        expect(jobs[0].workflow.Sampler.inputs.steps).toBe(10);
        expect(jobs[1].workflow.Sampler.inputs.steps).toBe(21);
      },
    );
  });

  it("keeps a qualified base name pointing at that file when the name is ambiguous", async () => {
    await withTempTree(
      {
        "workflows/current/needed-base.json": baseWithSteps(21),
        "workflows/archive/needed-base.json": baseWithSteps(5),
        "inputs/choose-current.yaml":
          "- base-workflow: current/needed-base\n  prompts: [{prompt: [x]}]\n",
        "inputs/choose-archive.yaml":
          "- base-workflow: archive/needed-base\n  prompts: [{prompt: [y]}]\n",
        "inputs/choose-plain.yaml":
          "- base-workflow: needed-base\n  prompts: [{prompt: [z]}]\n",
        // The same two names in one input file.
        "inputs/both-names.yaml":
          "- base-workflow: current/needed-base\n  prompts: [{prompt: [x]}]\n" +
          "- base-workflow: archive/needed-base\n  prompts: [{prompt: [y]}]\n",
      },
      async (root) => {
        const inputsDir = path.join(root, "inputs");
        const workflowsDir = path.join(root, "workflows");
        for (const [name, steps] of [
          ["choose-current", 21],
          ["choose-archive", 5],
        ]) {
          const jobs = await loadWorkflows(name, inputsDir, workflowsDir);
          expect(jobs[0].workflow.Sampler.inputs.steps).toBe(steps);
        }
        // One run that mixes both names proves the base cache is keyed on the
        // whole qualified name, not on the file name alone: keyed on
        // path.basename, the second prompt silently runs the first copy.
        const both = await loadWorkflows("both-names", inputsDir, workflowsDir);
        expect(both.map((job) => job.workflow.Sampler.inputs.steps)).toEqual([
          21, 5,
        ]);
        // With no folder to tell them apart, a run must not guess.
        await expect(
          loadWorkflows("choose-plain", inputsDir, workflowsDir),
        ).rejects.toThrow(/Ambiguous "needed-base\.json"/);
      },
    );
  });

  it("reports which copies collided when a base name matches at two depths", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`exit ${code}`);
    });
    await withTempTree(
      {
        "workflows/needed-base.json": BASE_JSON,
        "workflows/branch/needed-base.json": BASE_JSON,
        "inputs/guess.yaml":
          "- base-workflow: old/needed-base\n  prompts: [{prompt: [x]}]\n",
      },
      async (root) => {
        const workflowsDir = path.join(root, "workflows");
        await expect(
          requireWorkflows("guess", path.join(root, "inputs"), workflowsDir),
        ).rejects.toThrow("exit 1");
        // The batch sees the loader's prefix and the ambiguity as one line: the
        // input it was asked for, the file name, then both copies in the order
        // the walk found them, so the shallower copy is the one named first.
        const reported = error.mock.calls.map((call) => String(call[0]));
        const message = reported.find((text) =>
          text.includes('Could not load input "guess": Ambiguous'),
        );
        expect(message).toContain('Ambiguous "needed-base.json"');
        expect(message.split('Ambiguous "needed-base.json": ')[1]).toEqual(
          [
            path.join(workflowsDir, "needed-base.json"),
            path.join(workflowsDir, "branch", "needed-base.json"),
          ].join(", "),
        );
        expect(exit).toHaveBeenCalledWith(1);
      },
      "gen-ai-workflows-",
    );
  });

  it("runs from COMFY_ASSETS_PATH to jobs built at depth", async () => {
    await withTempTree(
      {
        "inputs/archive/2024/runme.yaml":
          "- base-workflow: deep-base\n  prompts: [{prompt: [external base]}]\n",
        "workflows/nested/deep/deep-base.json": BASE_JSON,
      },
      async (root) => {
        const config = await loadConfig({
          COMFY_SERVER: "http://env",
          COMFY_ASSETS_PATH: root,
        });
        expect(config.assetsPath).toBe(root);
        expect(config.inputsDir).toBe(path.join(root, "inputs"));
        expect(config.workflowsDir).toBe(path.join(root, "workflows"));
        // The folders the config derived are what comfyui/batch.mjs hands the
        // loader, and both files sit three folders below them: the run names
        // "runme" and "deep-base" only, and still gets a built job.
        const jobs = await requireWorkflows(
          "runme",
          config.inputsDir,
          config.workflowsDir,
        );
        expect(jobs).toHaveLength(1);
        expect(getFinalPositivePrompt(jobs[0].workflow)).toContain(
          "external base",
        );
        const baseReads = readLog.paths.filter((read) =>
          read.endsWith("deep-base.json"),
        );
        expect(baseReads).toEqual([
          path.join(root, "workflows", "nested", "deep", "deep-base.json"),
        ]);
      },
      "gen-ai-workflows-",
    );
  });

  it("reports unparsable YAML with the file the search resolved", async () => {
    await withInput(
      "- base-workflow: example-base-workflow\n  prompts: [{prompt: [oops]\n",
      async (name, inputsDir) => {
        const error = await loadWorkflows(name, inputsDir).catch((err) => err);
        expect(error.message).toContain(
          `Invalid YAML in ${path.join(inputsDir, `${name}.yaml`)}`,
        );
      },
    );
  });

  it("refuses an item that lost the base workflow it was told to run", async () => {
    await withInput(
      '- base-workflow: example-base-workflow\n  prompts:\n    - base-workflow: ""\n      prompt: [ok]\n',
      async (name, inputsDir) => {
        await expect(loadWorkflows(name, inputsDir)).rejects.toThrow(
          'Input item is missing "base-workflow"',
        );
      },
    );
  });

  it("hands the built jobs back through the CLI helper", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {});
    await withTempTree(
      {
        "workflows/archive/deep/deep-base.json": BASE_JSON,
        "inputs/runnable.yaml":
          "- base-workflow: deep-base\n  output-folder: test\n  filename-prefix: test\n  prompts: [{prompt: [run me]}]\n",
      },
      async (root) => {
        const jobs = await requireWorkflows(
          "runnable",
          path.join(root, "inputs"),
          path.join(root, "workflows"),
        );
        expect(jobs).toHaveLength(1);
        expect(jobs[0].workflow.Sampler.inputs.steps).toBe(10);
        expect(jobs[0].input.prompt).toEqual(["run me"]);
        // A healthy run stays silent and does not exit.
        expect(exit).not.toHaveBeenCalled();
      },
    );
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
