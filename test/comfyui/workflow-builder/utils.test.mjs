import { describe, expect, it } from "vitest";
import {
  findModelLoader,
  findNodeByClass,
  findNegativeClip,
  getFinalLogDataFromWorkflow,
  getModelName,
  insertNodesAfter,
  rewireLoaderRefs,
} from "../../../comfyui/workflow-builder/utils.mjs";

describe("utils.mjs", () => {
  it("findNodeByClass returns undefined when class not found", () => {
    expect(
      findNodeByClass(
        { Sampler: { class_type: "KSampler", inputs: {} } },
        "CLIPTextEncode",
      ),
    ).toBeUndefined();
  });

  it("findNodeByClass returns { label, node } when class is found", () => {
    const wf = {
      Sampler: { class_type: "KSampler", inputs: {} },
      ClipA: { class_type: "CLIPTextEncode", inputs: { text: "hello" } },
    };
    const result = findNodeByClass(wf, "CLIPTextEncode");
    expect(result).toEqual({ label: "ClipA", node: wf.ClipA });
  });

  it("findNegativeClip falls back to for-loop when no NegativeCLIP_Base", () => {
    const wf = {
      Sampler: {
        class_type: "KSampler",
        inputs: {
          positive: ["PosClip", 0],
          negative: ["NonExistentNeg", 0],
        },
      },
      PosClip: {
        class_type: "CLIPTextEncode",
        inputs: { clip: [], text: "" },
      },
      NegCLIP: {
        class_type: "CLIPTextEncode",
        inputs: { clip: [], text: "" },
      },
    };
    expect(findNegativeClip(wf, wf.Sampler)).toBe(wf.NegCLIP);
  });

  it("findModelLoader reports a checkpoint loader with its CLIP output", () => {
    const wf = {
      CheckpointLoader_Base: {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "sd_xl_base.safetensors" },
      },
    };
    expect(findModelLoader(wf)).toEqual({
      label: "CheckpointLoader_Base",
      node: wf.CheckpointLoader_Base,
      modelOnly: false,
      clipOutput: 1,
      nameInput: "ckpt_name",
    });
  });

  it("findModelLoader reports a UNET loader as model-only with no CLIP output", () => {
    const wf = {
      UNETLoader_Base: {
        class_type: "UNETLoader",
        inputs: {
          unet_name: "krea2_unet.safetensors",
          weight_dtype: "default",
        },
      },
      CLIPLoader_Base: { class_type: "CLIPLoader", inputs: {} },
    };
    expect(findModelLoader(wf)).toEqual({
      label: "UNETLoader_Base",
      node: wf.UNETLoader_Base,
      modelOnly: true,
      clipOutput: null,
      nameInput: "unet_name",
    });
  });

  it("findModelLoader prefers the checkpoint when a base carries both loaders", () => {
    const wf = {
      UNETLoader_Base: {
        class_type: "UNETLoader",
        inputs: { unet_name: "extra_unet.safetensors" },
      },
      CheckpointLoader_Base: {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "sd_xl_base.safetensors" },
      },
    };
    expect(findModelLoader(wf).label).toBe("CheckpointLoader_Base");
    expect(findModelLoader(wf).modelOnly).toBe(false);
  });

  it("findModelLoader returns undefined when neither loader class is present", () => {
    const wf = { Sampler: { class_type: "KSampler", inputs: {} } };
    expect(findModelLoader(wf)).toBeUndefined();
  });

  // getModelName feeds the `model` field of every log entry (jobs/log.mjs),
  // documented as the `ckpt_name` of a checkpoint or the `unet_name` of a
  // UNETLoader base — so each loader kind must be read from its own input key.
  for (const [classType, nameInput, modelName] of [
    ["UNETLoader", "unet_name", "krea2_unet.safetensors"],
    ["CheckpointLoaderSimple", "ckpt_name", "sd_xl_base.safetensors"],
  ]) {
    it(`getModelName reads ${nameInput} on a ${classType} base`, () => {
      const wf = {
        Base: { class_type: classType, inputs: { [nameInput]: modelName } },
        Sampler: { class_type: "KSampler", inputs: { seed: 7 } },
      };
      expect(getModelName(wf)).toBe(modelName);
      expect(getFinalLogDataFromWorkflow(wf).model).toBe(modelName);
    });
  }

  it("getModelName is undefined when the base has neither loader class", () => {
    const wf = {
      // A loader outside the MODEL_LOADERS table: the log entry must not
      // invent a model name from its `ckpt_name`.
      DummyLoader_Base: {
        class_type: "DummyLoader",
        inputs: { ckpt_name: "dummy.safetensors" },
      },
      Sampler: { class_type: "KSampler", inputs: { seed: 7 } },
    };
    expect(getModelName(wf)).toBeUndefined();
    expect(getFinalLogDataFromWorkflow(wf).model).toBeUndefined();
  });

  it("rewireLoaderRefs moves only index-0 model links on a model-only loader", () => {
    const wf = {
      UNETLoader_Base: { class_type: "UNETLoader", inputs: {} },
      Sampler: {
        class_type: "KSampler",
        inputs: { model: ["UNETLoader_Base", 0] },
      },
      // A consumer that reads the loader at its CLIP-style and VAE-style
      // output indices: UNETLoader has no CLIP output, so neither may move.
      Extra: {
        class_type: "ModelApplyCustom",
        inputs: {
          other: ["UNETLoader_Base", 1],
          vae: ["UNETLoader_Base", 2],
          plain: "UNETLoader_Base",
        },
      },
      // Nodes with nothing to rewire: the guard must skip them, not crash on
      // a missing or non-object `inputs`.
      NoInputs: { class_type: "PlainTextEncode" },
      OddInputs: { class_type: "PlainTextEncode", inputs: "not-a-link-dict" },
    };
    rewireLoaderRefs(wf, "UNETLoader_Base", "Lora_1", null);
    expect(wf.Sampler.inputs.model).toEqual(["Lora_1", 0]);
    expect(wf.Extra.inputs.other).toEqual(["UNETLoader_Base", 1]);
    expect(wf.Extra.inputs.vae).toEqual(["UNETLoader_Base", 2]);
    // A bare string reference is not a node link and stays untouched.
    expect(wf.Extra.inputs.plain).toBe("UNETLoader_Base");
    expect(wf.NoInputs).not.toHaveProperty("inputs");
    expect(wf.OddInputs.inputs).toBe("not-a-link-dict");
  });

  it("rewireLoaderRefs moves CLIP links only when the loader exposes index 1", () => {
    const wf = {
      CheckpointLoader_Base: {
        class_type: "CheckpointLoaderSimple",
        inputs: {},
      },
      ClipSkip_Base: {
        class_type: "CLIPSetLastLayer",
        inputs: { clip: ["CheckpointLoader_Base", 1] },
      },
      VAEDecode_1: {
        class_type: "VAEDecode",
        inputs: { vae: ["CheckpointLoader_Base", 2] },
      },
    };
    rewireLoaderRefs(wf, "CheckpointLoader_Base", "Lora_1", 1);
    expect(wf.ClipSkip_Base.inputs.clip).toEqual(["Lora_1", 1]);
    // The VAE port is never rewired.
    expect(wf.VAEDecode_1.inputs.vae).toEqual(["CheckpointLoader_Base", 2]);
  });

  it("insertNodesAfter splices after the anchor and ignores an unknown anchor", () => {
    const wf = {
      A: { class_type: "UNETLoader", inputs: {} },
      B: { class_type: "CLIPLoader", inputs: {} },
    };
    insertNodesAfter(wf, "A", {
      Lora_1: { class_type: "LoraLoaderModelOnly", inputs: {} },
    });
    expect(Object.keys(wf)).toEqual(["A", "Lora_1", "B"]);
    insertNodesAfter(wf, "NoSuchNode", {
      Lora_2: { class_type: "LoraLoaderModelOnly", inputs: {} },
    });
    // Unknown anchor: nothing is inserted, nothing is reordered.
    expect(Object.keys(wf)).toEqual(["A", "Lora_1", "B"]);
    expect(wf.Lora_2).toBeUndefined();
  });
});
