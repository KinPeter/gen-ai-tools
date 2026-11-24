import { describe, expect, it } from "vitest";
import { applyOverrides } from "../../../comfyui/workflow-builder/overrides.mjs";
import {
  applyInputImageOverrides,
  buildInputImageNodes,
  findInputImageChain,
} from "../../../comfyui/workflow-builder/input-images.mjs";

const CHAIN_ERROR =
  '"inputs" requires a LoadImage, ImageScaleToTotalPixels, VAEEncode_Reference and ReferenceLatent chain in the base workflow';

describe("input-images.mjs", () => {
  // Bases built inline rather than read from comfyui/workflows/: these tests
  // need base values a test can tell a default apart from, and the shipped
  // img2img example cannot be one — it carries two reference-image chains,
  // outside the contract stated at the numbered-chain tests below. Kept from
  // that example: the checkpoint-free UNET loader trio, its 1200x768
  // EmptyLatentImage and its sampler seed. Replaced on purpose: the reference
  // chain's scaling settings and the VAE its encode reads, so the values the
  // appended chains must copy are never mistaken for hard-coded defaults.
  const BASE_SCALE = {
    upscale_method: "nearest-exact",
    megapixels: 1.5,
    resolution_steps: 8,
  };
  // The UNET base reads its reference latent from a second VAE loader, not from
  // the loader its image decoder uses, and a checkpoint base reads its reference
  // latent from the checkpoint's index-2 VAE output. A builder that hard-codes
  // ["VAELoader_Base", 0] or index 0 fails the exact node shapes below.
  const UNET_REF_VAE = ["VAELoader_Reference", 0];
  const UNET_DECODE_VAE = ["VAELoader_Base", 0];
  const CHECKPOINT_REF_VAE = ["CheckpointLoader_Base", 2];

  // The one reference-image chain each base carries: LoadImage ->
  // ImageScaleToTotalPixels -> VAEEncode_Reference -> ReferenceLatent pair,
  // conditioning the sampler on both sides. Labels vary to exercise the
  // class_type fallback and a base whose one chain is already numbered _1.
  const PLAIN_CHAIN = {
    load: "LoadImage",
    scale: "ImageScaleToTotalPixels",
    vae: "VAEEncode_Reference",
    pos: "ReferenceLatent_Positive",
    neg: "ReferenceLatent_Negative",
  };
  const RENAMED_CHAIN = {
    load: "InputPicture",
    scale: "ScaleToPixels_Input",
    vae: "EncodeReference",
    pos: "RefCond_Positive",
    neg: "RefCond_Negative",
  };
  const NUMBERED_CHAIN_1 = {
    load: "LoadImage_1",
    scale: "ImageScaleToTotalPixels_1",
    vae: "VAEEncode_Reference_1",
    pos: "ReferenceLatent_Positive_1",
    neg: "ReferenceLatent_Negative_1",
  };
  function makeImageNodes({ load, scale, vae }, { image, vaeLink }) {
    return {
      [load]: { class_type: "LoadImage", inputs: { image } },
      [scale]: {
        class_type: "ImageScaleToTotalPixels",
        inputs: { image: [load, 0], ...BASE_SCALE },
      },
      [vae]: {
        class_type: "VAEEncode",
        inputs: { pixels: [scale, 0], vae: vaeLink },
      },
    };
  }

  function makeReferenceNodes({ pos, neg, vae }, seeds) {
    return {
      [pos]: {
        class_type: "ReferenceLatent",
        inputs: { conditioning: [seeds.pos, 0], latent: [vae, 0] },
      },
      [neg]: {
        class_type: "ReferenceLatent",
        inputs: { conditioning: [seeds.neg, 0], latent: [vae, 0] },
      },
    };
  }

  // Loader shapes a base with a reference chain may start from, plus the links
  // that differ between them: where the CLIP text node reads its encoder, what
  // the KSampler reads as its model, and which node the reference encode and the
  // image decoder take their VAE from. The checkpoint shape is what a real
  // img2img checkpoint base looks like: a model node sits between the loader and
  // the sampler, as example-img2img-workflow.json's FluxKVCache_Model does, and
  // the reference latent comes from the checkpoint's index-2 VAE output — the
  // link "loras" promises never to move (utils.mjs rewireLoaderRefs).
  const UNET_BASE = {
    loaders: {
      UNETLoader_Base: {
        class_type: "UNETLoader",
        inputs: { unet_name: "flux2-dev.safetensors", weight_dtype: "default" },
      },
      CLIPLoader_Base: {
        class_type: "CLIPLoader",
        inputs: {
          clip_name: "clip.safetensors",
          type: "flux2",
          device: "default",
        },
      },
      VAELoader_Base: {
        class_type: "VAELoader",
        inputs: { vae_name: "flux2-vae.safetensors" },
      },
      VAELoader_Reference: {
        class_type: "VAELoader",
        inputs: { vae_name: "flux2-vae-reference.safetensors" },
      },
    },
    clipSource: ["CLIPLoader_Base", 0],
    samplerModel: ["UNETLoader_Base", 0],
    refVae: UNET_REF_VAE,
    decodeVae: UNET_DECODE_VAE,
  };
  const CHECKPOINT_BASE = {
    loaders: {
      CheckpointLoader_Base: {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "flux2-dev.safetensors" },
      },
      FluxKVCache_Model: {
        class_type: "FluxKVCache",
        inputs: { model: ["CheckpointLoader_Base", 0] },
      },
    },
    clipSource: ["CheckpointLoader_Base", 1],
    samplerModel: ["FluxKVCache_Model", 0],
    refVae: CHECKPOINT_REF_VAE,
    decodeVae: CHECKPOINT_REF_VAE,
  };

  // A base carries one reference-image chain and its sampler reads that chain's
  // ReferenceLatent pair, so `chain` alone decides the labels the sampler links
  // to; `base` picks the loader shape that chain hangs off.
  function makeBaseWorkflow({ chain = PLAIN_CHAIN, base = UNET_BASE } = {}) {
    const seeds = {
      pos: "PositiveCLIP_Base",
      neg: "ConditioningZeroOut_Negative",
    };

    return {
      ...base.loaders,
      EmptyLatentImage: {
        class_type: "EmptyLatentImage",
        inputs: { batch_size: 1, height: 1200, width: 768 },
      },
      ...makeImageNodes(chain, {
        image: "base-input.jpg",
        vaeLink: base.refVae,
      }),
      PositiveCLIP_Base: {
        class_type: "CLIPTextEncode",
        inputs: { clip: base.clipSource, text: "base prompt" },
      },
      ConditioningZeroOut_Negative: {
        class_type: "ConditioningZeroOut",
        inputs: { conditioning: ["PositiveCLIP_Base", 0] },
      },
      ...makeReferenceNodes(chain, seeds),
      Sampler: {
        class_type: "KSampler",
        inputs: {
          model: base.samplerModel,
          seed: 153983780105415,
          steps: 4,
          cfg: 1,
          sampler_name: "euler",
          scheduler: "simple",
          positive: [chain.pos, 0],
          negative: [chain.neg, 0],
          latent_image: ["EmptyLatentImage", 0],
          denoise: 1,
        },
      },
      VAEDecode_1: {
        class_type: "VAEDecode",
        inputs: { samples: ["Sampler", 0], vae: base.decodeVae },
      },
      SaveImage: {
        class_type: "SaveImage",
        inputs: { images: ["VAEDecode_1", 0], filename_prefix: "img2img" },
      },
    };
  }

  function makeTextToImageBase() {
    return {
      CheckpointLoader_Base: {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "model.safetensors" },
      },
      PositiveCLIP_Base: {
        class_type: "CLIPTextEncode",
        inputs: { clip: ["CheckpointLoader_Base", 1], text: "base prompt" },
      },
      NegativeCLIP_Base: {
        class_type: "CLIPTextEncode",
        inputs: { clip: ["CheckpointLoader_Base", 1], text: "bad" },
      },
      EmptyLatentImage: {
        class_type: "EmptyLatentImage",
        inputs: { width: 1024, height: 1024, batch_size: 1 },
      },
      Sampler: {
        class_type: "KSampler",
        inputs: {
          model: ["CheckpointLoader_Base", 0],
          seed: 7,
          steps: 28,
          cfg: 3.5,
          sampler_name: "euler",
          scheduler: "simple",
          positive: ["PositiveCLIP_Base", 0],
          negative: ["NegativeCLIP_Base", 0],
          latent_image: ["EmptyLatentImage", 0],
          denoise: 1,
        },
      },
      SaveImage: {
        class_type: "SaveImage",
        inputs: { filename_prefix: "txt2img" },
      },
    };
  }

  // The ReferenceLatent nodes the sampler's conditioning links pass through,
  // listed from the first image to the last, plus the node the walk leaves the
  // chain at — the one that carries the prompt text. A chain that does not
  // reach that node silently drops the prompt, which "inputs" must preserve.
  function conditioningChain(workflow, sampler, side) {
    const labels = [];
    const seen = new Set();
    let label = sampler.inputs[side][0];
    while (
      workflow[label]?.class_type === "ReferenceLatent" &&
      !seen.has(label)
    ) {
      labels.unshift(label);
      seen.add(label);
      label = workflow[label].inputs.conditioning[0];
    }
    return { chain: labels, conditioningSource: label };
  }

  // Only the labels the workflow has and `before` did not, so one assertion can
  // pin the whole appended block. A node written onto a label the base already
  // carried is invisible here — `before` had that label — which is exactly what
  // `baseNodes()` is for, so the tests that append onto a numbered base compare
  // both maps.
  function addedNodes(workflow, before) {
    return Object.fromEntries(
      Object.keys(workflow)
        .filter((label) => !(label in before))
        .map((label) => [label, workflow[label]]),
    );
  }

  // Only the labels the base carried, so an assertion on this map fails when a
  // base node's inputs move, when an appended node lands on a base label and
  // replaces it, or when a base node disappears — the three things addedNodes()
  // cannot see, because it reports labels `before` never had.
  function baseNodes(workflow, before) {
    return Object.fromEntries(
      Object.keys(before).map((label) => [label, workflow[label]]),
    );
  }

  function inputsOverrides(...filenames) {
    return { inputs: filenames };
  }

  it("changes nothing when the block has no inputs key", () => {
    const workflow = makeBaseWorkflow();
    const before = structuredClone(workflow);
    applyInputImageOverrides(workflow, workflow.Sampler, { steps: 4 });
    expect(workflow).toEqual(before);
    expect(Object.keys(workflow)).toEqual(Object.keys(before));
  });

  it("changes nothing when item carries no settings at all", () => {
    const workflow = makeBaseWorkflow();
    const before = structuredClone(workflow);
    applyInputImageOverrides(workflow, workflow.Sampler, undefined);
    expect(workflow).toEqual(before);
  });

  it("changes nothing when inputs is an empty list", () => {
    const workflow = makeBaseWorkflow();
    const before = structuredClone(workflow);
    applyInputImageOverrides(workflow, workflow.Sampler, { inputs: [] });
    expect(workflow).toEqual(before);
    expect(Object.keys(workflow)).toEqual(Object.keys(before));
  });

  it("swaps only the base LoadImage filename for one input image", () => {
    const workflow = makeBaseWorkflow();
    const before = structuredClone(workflow);
    applyInputImageOverrides(
      workflow,
      workflow.Sampler,
      inputsOverrides("only.jpg"),
    );

    expect(workflow.LoadImage.inputs).toEqual({ image: "only.jpg" });
    expect(Object.keys(workflow.LoadImage.inputs)).toEqual(["image"]);
    expect(Object.keys(workflow)).toEqual(Object.keys(before));
    expect(workflow.Sampler.inputs.positive).toEqual([
      "ReferenceLatent_Positive",
      0,
    ]);
    expect(workflow.Sampler.inputs.negative).toEqual([
      "ReferenceLatent_Negative",
      0,
    ]);
    expect(Object.keys(workflow.Sampler.inputs)).toEqual(
      Object.keys(before.Sampler.inputs),
    );
    // Everything else in the chain keeps the base's settings, labels and links:
    // a single filename changes exactly one filename and nothing else.
    expect(workflow.ReferenceLatent_Positive).toEqual(
      before.ReferenceLatent_Positive,
    );
    expect(workflow.VAEEncode_Reference.inputs.pixels).toEqual([
      "ImageScaleToTotalPixels",
      0,
    ]);
    expect(Object.keys(workflow)).not.toContain("LoadImage_2");
    expect(workflow.ImageScaleToTotalPixels.inputs.megapixels).toBe(1.5);
  });

  it("adds a second reference-image chain and moves the sampler onto it", () => {
    const workflow = makeBaseWorkflow();
    const before = structuredClone(workflow);
    applyInputImageOverrides(
      workflow,
      workflow.Sampler,
      inputsOverrides("a.jpg", "b.jpg"),
    );

    expect(workflow.LoadImage.inputs.image).toBe("a.jpg");
    expect(workflow.LoadImage_2).toEqual({
      class_type: "LoadImage",
      inputs: { image: "b.jpg" },
    });
    // Both copy the base chain instead of a default: the scaling settings come
    // from the base scale node's values, the VAE link from the base reference
    // encode, including its output index.
    expect(workflow.ImageScaleToTotalPixels_2).toEqual({
      class_type: "ImageScaleToTotalPixels",
      inputs: { image: ["LoadImage_2", 0], ...BASE_SCALE },
    });
    expect(workflow.VAEEncode_Reference_2).toEqual({
      class_type: "VAEEncode",
      inputs: {
        pixels: ["ImageScaleToTotalPixels_2", 0],
        vae: UNET_REF_VAE,
      },
    });
    expect(workflow.ReferenceLatent_Positive_2).toEqual({
      class_type: "ReferenceLatent",
      inputs: {
        conditioning: ["ReferenceLatent_Positive", 0],
        latent: ["VAEEncode_Reference_2", 0],
      },
    });
    expect(workflow.ReferenceLatent_Negative_2).toEqual({
      class_type: "ReferenceLatent",
      inputs: {
        conditioning: ["ReferenceLatent_Negative", 0],
        latent: ["VAEEncode_Reference_2", 0],
      },
    });
    expect(workflow.Sampler.inputs.positive).toEqual([
      "ReferenceLatent_Positive_2",
      0,
    ]);
    expect(workflow.Sampler.inputs.negative).toEqual([
      "ReferenceLatent_Negative_2",
      0,
    ]);

    // Base nodes are left alone: only the base LoadImage's image value moved.
    expect(workflow.ReferenceLatent_Positive).toEqual(
      before.ReferenceLatent_Positive,
    );
    expect(workflow.ReferenceLatent_Negative).toEqual(
      before.ReferenceLatent_Negative,
    );
    expect(workflow.ImageScaleToTotalPixels).toEqual(
      before.ImageScaleToTotalPixels,
    );
    expect(workflow.VAEEncode_Reference).toEqual(before.VAEEncode_Reference);
    // The base's own image decoder keeps its own loader — only the reference
    // chain's VAE source is inherited by the appended encode.
    expect(workflow.VAEDecode_1.inputs.vae).toEqual(UNET_DECODE_VAE);

    // The new block lands immediately after the base chain's negative
    // ReferenceLatent, which the goldens' key order depends on.
    const keys = Object.keys(workflow);
    const anchor = keys.indexOf("ReferenceLatent_Negative");
    expect(keys.slice(anchor + 1, anchor + 6)).toEqual([
      "LoadImage_2",
      "ImageScaleToTotalPixels_2",
      "VAEEncode_Reference_2",
      "ReferenceLatent_Positive_2",
      "ReferenceLatent_Negative_2",
    ]);
    expect(keys[anchor + 6]).toBe("Sampler");

    const positive = conditioningChain(workflow, workflow.Sampler, "positive");
    expect(positive.chain).toEqual([
      "ReferenceLatent_Positive",
      "ReferenceLatent_Positive_2",
    ]);
    expect(positive.conditioningSource).toBe("PositiveCLIP_Base");
    const negative = conditioningChain(workflow, workflow.Sampler, "negative");
    expect(negative.chain).toEqual([
      "ReferenceLatent_Negative",
      "ReferenceLatent_Negative_2",
    ]);
    expect(negative.conditioningSource).toBe("ConditioningZeroOut_Negative");
  });

  it("chains three input images and rewires the sampler onto the _3 pair", () => {
    const workflow = makeBaseWorkflow();
    applyInputImageOverrides(
      workflow,
      workflow.Sampler,
      inputsOverrides("a.jpg", "b.jpg", "c.jpg"),
    );

    expect([
      workflow.LoadImage.inputs.image,
      workflow.LoadImage_2.inputs.image,
      workflow.LoadImage_3.inputs.image,
    ]).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    expect(workflow.ReferenceLatent_Positive_2.inputs).toEqual({
      conditioning: ["ReferenceLatent_Positive", 0],
      latent: ["VAEEncode_Reference_2", 0],
    });
    expect(workflow.ReferenceLatent_Positive_3.inputs).toEqual({
      conditioning: ["ReferenceLatent_Positive_2", 0],
      latent: ["VAEEncode_Reference_3", 0],
    });
    expect(workflow.ReferenceLatent_Negative_2.inputs).toEqual({
      conditioning: ["ReferenceLatent_Negative", 0],
      latent: ["VAEEncode_Reference_2", 0],
    });
    expect(workflow.ReferenceLatent_Negative_3.inputs).toEqual({
      conditioning: ["ReferenceLatent_Negative_2", 0],
      latent: ["VAEEncode_Reference_3", 0],
    });
    expect(workflow.Sampler.inputs.positive).toEqual([
      "ReferenceLatent_Positive_3",
      0,
    ]);
    expect(workflow.Sampler.inputs.negative).toEqual([
      "ReferenceLatent_Negative_3",
      0,
    ]);

    // Grouping a hand-built chain uses: load/scale pairs for every image, then
    // the VAE encodes, then the two conditioning chains.
    const keys = Object.keys(workflow);
    const anchor = keys.indexOf("ReferenceLatent_Negative");
    expect(keys.slice(anchor + 1, anchor + 11)).toEqual([
      "LoadImage_2",
      "ImageScaleToTotalPixels_2",
      "LoadImage_3",
      "ImageScaleToTotalPixels_3",
      "VAEEncode_Reference_2",
      "VAEEncode_Reference_3",
      "ReferenceLatent_Positive_2",
      "ReferenceLatent_Positive_3",
      "ReferenceLatent_Negative_2",
      "ReferenceLatent_Negative_3",
    ]);

    const positive = conditioningChain(workflow, workflow.Sampler, "positive");
    expect(positive.chain).toEqual([
      "ReferenceLatent_Positive",
      "ReferenceLatent_Positive_2",
      "ReferenceLatent_Positive_3",
    ]);
    expect(positive.conditioningSource).toBe("PositiveCLIP_Base");
    const negative = conditioningChain(workflow, workflow.Sampler, "negative");
    expect(negative.chain).toEqual([
      "ReferenceLatent_Negative",
      "ReferenceLatent_Negative_2",
      "ReferenceLatent_Negative_3",
    ]);
    expect(negative.conditioningSource).toBe("ConditioningZeroOut_Negative");
  });

  it("finds a renamed chain by class_type", () => {
    const workflow = makeBaseWorkflow({ chain: RENAMED_CHAIN });
    expect(findInputImageChain(workflow, workflow.Sampler)).toEqual({
      loadImage: "InputPicture",
      imageScale: "ScaleToPixels_Input",
      vaeEncode: "EncodeReference",
      positiveRef: "RefCond_Positive",
      negativeRef: "RefCond_Negative",
    });

    applyInputImageOverrides(
      workflow,
      workflow.Sampler,
      inputsOverrides("a.jpg", "b.jpg"),
    );
    expect(workflow.InputPicture.inputs.image).toBe("a.jpg");
    // New nodes always use the conventional labels, whatever the base called
    // its own chain: they seed their conditioning from the chain ends found, and
    // copy the scaling settings and VAE link from the nodes found too.
    expect(workflow.ReferenceLatent_Positive_2).toEqual({
      class_type: "ReferenceLatent",
      inputs: {
        conditioning: ["RefCond_Positive", 0],
        latent: ["VAEEncode_Reference_2", 0],
      },
    });
    expect(workflow.ReferenceLatent_Negative_2.inputs.conditioning).toEqual([
      "RefCond_Negative",
      0,
    ]);
    expect(workflow.ImageScaleToTotalPixels_2.inputs.upscale_method).toBe(
      BASE_SCALE.upscale_method,
    );
    expect(workflow.VAEEncode_Reference_2.inputs.vae).toEqual(UNET_REF_VAE);
    expect(workflow.Sampler.inputs.positive).toEqual([
      "ReferenceLatent_Positive_2",
      0,
    ]);
  });

  // Two rulings the builder relies on about a base workflow: it carries exactly
  // one reference-image chain — the LoadImage / ImageScaleToTotalPixels /
  // VAEEncode_Reference / ReferenceLatent pair its KSampler reads — and that
  // chain's labels are either unsuffixed or numbered "_1". Together they keep the
  // "_2.._N" labels this override appends collision-free. A base with a second
  // reference chain, or with its one chain labelled "_2" or higher, is outside
  // that contract: what the builder does there is undefined and deliberately
  // untested, so do not re-add assertions for it. A base inside the contract
  // looks like the single "_1" chain the two tests below build, and because its
  // ends come from the sampler's own links, a numbered base exercises the same
  // seed logic as the unsuffixed ones above.
  it("appends _2 and _3 onto a base whose one chain is numbered _1", () => {
    const workflow = makeBaseWorkflow({ chain: NUMBERED_CHAIN_1 });
    const before = structuredClone(workflow);
    applyInputImageOverrides(
      workflow,
      workflow.Sampler,
      inputsOverrides("a.jpg", "b.jpg", "c.jpg"),
    );

    // Filename 1 replaces the filename the base chain's own LoadImage carried;
    // filenames 2 and 3 each bring a complete chain of their own, seeded from
    // the chain ends the sampler reads, which here are the base's "_1" pair.
    expect(workflow.LoadImage_1.inputs).toEqual({ image: "a.jpg" });
    expect(addedNodes(workflow, before)).toEqual({
      LoadImage_2: { class_type: "LoadImage", inputs: { image: "b.jpg" } },
      ImageScaleToTotalPixels_2: {
        class_type: "ImageScaleToTotalPixels",
        inputs: { image: ["LoadImage_2", 0], ...BASE_SCALE },
      },
      LoadImage_3: { class_type: "LoadImage", inputs: { image: "c.jpg" } },
      ImageScaleToTotalPixels_3: {
        class_type: "ImageScaleToTotalPixels",
        inputs: { image: ["LoadImage_3", 0], ...BASE_SCALE },
      },
      VAEEncode_Reference_2: {
        class_type: "VAEEncode",
        inputs: {
          pixels: ["ImageScaleToTotalPixels_2", 0],
          vae: UNET_REF_VAE,
        },
      },
      VAEEncode_Reference_3: {
        class_type: "VAEEncode",
        inputs: {
          pixels: ["ImageScaleToTotalPixels_3", 0],
          vae: UNET_REF_VAE,
        },
      },
      ReferenceLatent_Positive_2: {
        class_type: "ReferenceLatent",
        inputs: {
          conditioning: ["ReferenceLatent_Positive_1", 0],
          latent: ["VAEEncode_Reference_2", 0],
        },
      },
      ReferenceLatent_Positive_3: {
        class_type: "ReferenceLatent",
        inputs: {
          conditioning: ["ReferenceLatent_Positive_2", 0],
          latent: ["VAEEncode_Reference_3", 0],
        },
      },
      ReferenceLatent_Negative_2: {
        class_type: "ReferenceLatent",
        inputs: {
          conditioning: ["ReferenceLatent_Negative_1", 0],
          latent: ["VAEEncode_Reference_2", 0],
        },
      },
      ReferenceLatent_Negative_3: {
        class_type: "ReferenceLatent",
        inputs: {
          conditioning: ["ReferenceLatent_Negative_2", 0],
          latent: ["VAEEncode_Reference_3", 0],
        },
      },
    });
    expect(workflow.Sampler.inputs.positive).toEqual([
      "ReferenceLatent_Positive_3",
      0,
    ]);
    expect(workflow.Sampler.inputs.negative).toEqual([
      "ReferenceLatent_Negative_3",
      0,
    ]);

    // The block lands immediately after the base chain's negative
    // ReferenceLatent, the anchor the goldens' key order depends on, and the
    // sampler still follows it.
    const keys = Object.keys(workflow);
    const anchor = keys.indexOf("ReferenceLatent_Negative_1");
    expect(keys.slice(anchor + 1, anchor + 11)).toEqual([
      "LoadImage_2",
      "ImageScaleToTotalPixels_2",
      "LoadImage_3",
      "ImageScaleToTotalPixels_3",
      "VAEEncode_Reference_2",
      "VAEEncode_Reference_3",
      "ReferenceLatent_Positive_2",
      "ReferenceLatent_Positive_3",
      "ReferenceLatent_Negative_2",
      "ReferenceLatent_Negative_3",
    ]);
    expect(keys[anchor + 11]).toBe("Sampler");
  });

  it("keeps a numbered base's own _1 pair conditioning the sampler", () => {
    const workflow = makeBaseWorkflow({ chain: NUMBERED_CHAIN_1 });
    const before = structuredClone(workflow);
    applyInputImageOverrides(
      workflow,
      workflow.Sampler,
      inputsOverrides("a.jpg", "b.jpg", "c.jpg"),
    );

    // Every node the base carried survives the append. Only the base chain's
    // LoadImage filename and the sampler's conditioning links move, which is
    // what "inputs" is for: the base's own "_1" ReferenceLatent pair stays
    // exactly as the base built it, so it is still a link in the sampler's
    // chains instead of losing its consumers or being replaced under its own
    // label.
    expect(baseNodes(workflow, before)).toEqual({
      ...before,
      LoadImage_1: { class_type: "LoadImage", inputs: { image: "a.jpg" } },
      Sampler: {
        ...before.Sampler,
        inputs: {
          ...before.Sampler.inputs,
          positive: ["ReferenceLatent_Positive_3", 0],
          negative: ["ReferenceLatent_Negative_3", 0],
        },
      },
    });

    // The prompt still conditions the sample: the walk out of the sampler
    // passes through the appended "_2" and "_3" pairs and leaves the
    // ReferenceLatent chain at the node the prompt text is written on — the
    // base's "_1" pair is part of the path, not an orphan beside it.
    const positive = conditioningChain(workflow, workflow.Sampler, "positive");
    expect(positive.chain).toEqual([
      "ReferenceLatent_Positive_1",
      "ReferenceLatent_Positive_2",
      "ReferenceLatent_Positive_3",
    ]);
    expect(positive.conditioningSource).toBe("PositiveCLIP_Base");
    const negative = conditioningChain(workflow, workflow.Sampler, "negative");
    expect(negative.chain).toEqual([
      "ReferenceLatent_Negative_1",
      "ReferenceLatent_Negative_2",
      "ReferenceLatent_Negative_3",
    ]);
    expect(negative.conditioningSource).toBe("ConditioningZeroOut_Negative");

    // One encoded latent per input image: no filename is folded into the base
    // chain's own VAE encode.
    expect(
      Object.values(workflow).filter((n) => n.class_type === "VAEEncode"),
    ).toHaveLength(3);
  });

  it("names the reference chain ends through the sampler, falling back to the conventional labels", () => {
    const workflow = makeBaseWorkflow();
    workflow.Sampler.inputs.positive = ["CondPos_End", 0];
    workflow.Sampler.inputs.negative = ["CondNeg_End", 0];
    workflow.CondPos_End = {
      class_type: "ConditioningConcat",
      inputs: {
        conditioning_a: ["ReferenceLatent_Positive", 0],
        conditioning_b: ["PositiveCLIP_Base", 0],
      },
    };
    workflow.CondNeg_End = {
      class_type: "ConditioningConcat",
      inputs: {
        conditioning_a: ["ReferenceLatent_Negative", 0],
        conditioning_b: ["ConditioningZeroOut_Negative", 0],
      },
    };

    // The sampler reads the concat nodes, so the chain ends come from the
    // conventional labels rather than the sampler links.
    expect(findInputImageChain(workflow, workflow.Sampler)).toEqual({
      loadImage: "LoadImage",
      imageScale: "ImageScaleToTotalPixels",
      vaeEncode: "VAEEncode_Reference",
      positiveRef: "ReferenceLatent_Positive",
      negativeRef: "ReferenceLatent_Negative",
    });

    applyInputImageOverrides(
      workflow,
      workflow.Sampler,
      inputsOverrides("a.jpg", "b.jpg"),
    );
    expect(workflow.ReferenceLatent_Positive_2.inputs.conditioning).toEqual([
      "ReferenceLatent_Positive",
      0,
    ]);
    expect(workflow.ReferenceLatent_Negative_2.inputs.conditioning).toEqual([
      "ReferenceLatent_Negative",
      0,
    ]);
    // The insert anchor is the conventional negative end, so the new block
    // lands between it and the concat nodes the sampler used to read.
    const keys = Object.keys(workflow);
    const anchor = keys.indexOf("ReferenceLatent_Negative");
    expect(keys.slice(anchor + 1, anchor + 6)).toEqual([
      "LoadImage_2",
      "ImageScaleToTotalPixels_2",
      "VAEEncode_Reference_2",
      "ReferenceLatent_Positive_2",
      "ReferenceLatent_Negative_2",
    ]);
    expect(keys.indexOf("CondNeg_End")).toBeGreaterThan(anchor + 5);
    expect(keys.indexOf("CondNeg_End")).toBe(keys.length - 1);
    expect(workflow.Sampler.inputs.positive).toEqual([
      "ReferenceLatent_Positive_2",
      0,
    ]);
  });

  it("rejects a base missing any node of the reference chain, leaving the workflow untouched", () => {
    for (const missing of [
      "LoadImage",
      "ImageScaleToTotalPixels",
      "VAEEncode_Reference",
      "ReferenceLatent_Positive",
      "ReferenceLatent_Negative",
    ]) {
      const workflow = makeBaseWorkflow();
      delete workflow[missing];
      const before = structuredClone(workflow);
      for (const item of [
        inputsOverrides("only.jpg"),
        inputsOverrides("a.jpg", "b.jpg"),
      ]) {
        expect(() =>
          applyInputImageOverrides(workflow, workflow.Sampler, item),
        ).toThrow(CHAIN_ERROR);
        expect(workflow).toEqual(before);
        expect(Object.keys(workflow)).toEqual(Object.keys(before));
      }
    }
  });

  it("rejects a text-to-image base that has no reference-image chain", () => {
    const workflow = makeTextToImageBase();
    const before = structuredClone(workflow);
    expect(() =>
      applyInputImageOverrides(
        workflow,
        workflow.Sampler,
        inputsOverrides("a.jpg", "b.jpg"),
      ),
    ).toThrow(CHAIN_ERROR);
    expect(workflow).toEqual(before);
  });

  it("builds the new nodes without touching the workflow", () => {
    const workflow = makeBaseWorkflow();
    const before = structuredClone(workflow);
    const chain = findInputImageChain(workflow, workflow.Sampler);
    const filenames = ["a.jpg", "b.jpg", "c.jpg", "d.jpg"];
    const nodes = buildInputImageNodes(workflow, chain, filenames);

    expect(Object.keys(nodes)).toEqual([
      "LoadImage_2",
      "ImageScaleToTotalPixels_2",
      "LoadImage_3",
      "ImageScaleToTotalPixels_3",
      "LoadImage_4",
      "ImageScaleToTotalPixels_4",
      "VAEEncode_Reference_2",
      "VAEEncode_Reference_3",
      "VAEEncode_Reference_4",
      "ReferenceLatent_Positive_2",
      "ReferenceLatent_Positive_3",
      "ReferenceLatent_Positive_4",
      "ReferenceLatent_Negative_2",
      "ReferenceLatent_Negative_3",
      "ReferenceLatent_Negative_4",
    ]);
    expect(nodes.LoadImage_4.inputs).toEqual({ image: "d.jpg" });
    // Even the last image carries the base chain's settings and VAE source, so
    // inheritance is pinned for every index, not only for image 2.
    expect(nodes.ImageScaleToTotalPixels_4.inputs).toEqual({
      image: ["LoadImage_4", 0],
      ...BASE_SCALE,
    });
    expect(nodes.VAEEncode_Reference_4.inputs.vae).toEqual(UNET_REF_VAE);
    expect(nodes.ReferenceLatent_Positive_4.inputs.conditioning).toEqual([
      "ReferenceLatent_Positive_3",
      0,
    ]);
    expect(nodes.ReferenceLatent_Negative_4.inputs).toEqual({
      conditioning: ["ReferenceLatent_Negative_3", 0],
      latent: ["VAEEncode_Reference_4", 0],
    });
    expect(nodes).not.toHaveProperty("LoadImage");
    expect(workflow).toEqual(before);
    expect(Object.keys(workflow)).toEqual(Object.keys(before));
    expect(workflow.LoadImage.inputs.image).toBe("base-input.jpg");
  });

  it("keeps inputs working alongside loras", () => {
    const workflow = makeBaseWorkflow();
    applyOverrides(
      workflow,
      {
        inputs: ["a.jpg", "b.jpg"],
        prompt: ["photorealistic"],
        loras: [{ name: "detail.safetensors", strength: 0.6 }],
      },
      false,
    );

    expect(workflow.Sampler.inputs.model).toEqual(["Lora_1", 0]);
    // A UNETLoader base takes model-only LoRAs, so the LoRA hangs off the loader
    // the base used for the sampler. Both VAE loaders keep their consumers: the
    // decoder its own, the appended encode the reference chain's.
    expect(workflow.Lora_1).toEqual({
      class_type: "LoraLoaderModelOnly",
      inputs: {
        model: ["UNETLoader_Base", 0],
        lora_name: "detail.safetensors",
        strength_model: 0.6,
      },
    });
    const keys = Object.keys(workflow);
    expect(keys[1]).toBe("Lora_1");
    expect(workflow.VAEDecode_1.inputs.vae).toEqual(UNET_DECODE_VAE);
    expect(workflow.VAEEncode_Reference_2.inputs.vae).toEqual(UNET_REF_VAE);
    const anchor = keys.indexOf("ReferenceLatent_Negative");
    expect(keys[anchor + 1]).toBe("LoadImage_2");
    expect(workflow.LoadImage.inputs.image).toBe("a.jpg");
    expect(workflow.Sampler.inputs.positive).toEqual([
      "ReferenceLatent_Positive_2",
      0,
    ]);
    expect(workflow.ReferenceLatent_Positive_2.inputs.conditioning).toEqual([
      "ReferenceLatent_Positive",
      0,
    ]);
    expect(workflow.PositiveCLIP_Base.inputs.text).toBe(
      "base prompt, photorealistic",
    );
    // The prompt text still reaches the sampler through the appended pair.
    const positive = conditioningChain(workflow, workflow.Sampler, "positive");
    expect(positive.chain).toEqual([
      "ReferenceLatent_Positive",
      "ReferenceLatent_Positive_2",
    ]);
    expect(positive.conditioningSource).toBe("PositiveCLIP_Base");
  });

  // A checkpoint base is where "loras" and "inputs" meet: its KSampler reads a
  // model node hanging off the checkpoint, its CLIP text node reads the
  // checkpoint's CLIP output (index 1), and its reference encode and its image
  // decoder read the checkpoint's VAE output (index 2). "loras" moves the
  // loader's model and CLIP consumers onto the LoRA and never a VAE link
  // (utils.mjs rewireLoaderRefs), so the chain "inputs" appends must still read
  // the base's index-2 VAE output.
  it("keeps a checkpoint base's index-2 VAE link on the chain inputs appends", () => {
    const workflow = makeBaseWorkflow({ base: CHECKPOINT_BASE });
    const before = structuredClone(workflow);
    applyOverrides(
      workflow,
      {
        inputs: ["a.jpg", "b.jpg"],
        prompt: ["cinematic"],
        loras: [{ name: "detail.safetensors", strength: 0.8 }],
      },
      false,
    );

    // Everything the two overrides added: the LoRA node, and image 2's chain,
    // which inherits the base chain's scaling settings, its index-2 VAE link,
    // and the conditioning seeds from the base chain's own ends.
    expect(addedNodes(workflow, before)).toEqual({
      Lora_1: {
        class_type: "LoraLoader",
        inputs: {
          model: ["CheckpointLoader_Base", 0],
          clip: ["CheckpointLoader_Base", 1],
          lora_name: "detail.safetensors",
          strength_model: 0.8,
          strength_clip: 0.8,
        },
      },
      LoadImage_2: { class_type: "LoadImage", inputs: { image: "b.jpg" } },
      ImageScaleToTotalPixels_2: {
        class_type: "ImageScaleToTotalPixels",
        inputs: { image: ["LoadImage_2", 0], ...BASE_SCALE },
      },
      VAEEncode_Reference_2: {
        class_type: "VAEEncode",
        inputs: {
          pixels: ["ImageScaleToTotalPixels_2", 0],
          vae: CHECKPOINT_REF_VAE,
        },
      },
      ReferenceLatent_Positive_2: {
        class_type: "ReferenceLatent",
        inputs: {
          conditioning: ["ReferenceLatent_Positive", 0],
          latent: ["VAEEncode_Reference_2", 0],
        },
      },
      ReferenceLatent_Negative_2: {
        class_type: "ReferenceLatent",
        inputs: {
          conditioning: ["ReferenceLatent_Negative", 0],
          latent: ["VAEEncode_Reference_2", 0],
        },
      },
    });

    // Every node the base carried survives, and the only ones that moved are the
    // checkpoint's consumers: the model node between loader and sampler now
    // reads the LoRA, the CLIP text node reads the LoRA's CLIP output and
    // carries the merged prompt, the base LoadImage carries filename 1, and the
    // sampler keeps reading the same model node while its conditioning and — as
    // always for an item without a fixed seed — its seed move. The base chain's
    // own encode and the image decoder stay on the checkpoint's index-2 output.
    expect(baseNodes(workflow, before)).toEqual({
      ...before,
      LoadImage: { class_type: "LoadImage", inputs: { image: "a.jpg" } },
      FluxKVCache_Model: {
        class_type: "FluxKVCache",
        inputs: { model: ["Lora_1", 0] },
      },
      PositiveCLIP_Base: {
        class_type: "CLIPTextEncode",
        inputs: { clip: ["Lora_1", 1], text: "base prompt, cinematic" },
      },
      Sampler: {
        ...before.Sampler,
        inputs: {
          ...before.Sampler.inputs,
          seed: expect.any(Number),
          positive: ["ReferenceLatent_Positive_2", 0],
          negative: ["ReferenceLatent_Negative_2", 0],
        },
      },
    });

    // Key order: the LoRA hangs off the loader it replaced, the appended chain
    // hangs off the base chain's negative ReferenceLatent, and the sampler still
    // follows that block.
    const keys = Object.keys(workflow);
    expect(keys.indexOf("Lora_1")).toBe(1);
    const anchor = keys.indexOf("ReferenceLatent_Negative");
    expect(keys.slice(anchor + 1, anchor + 6)).toEqual([
      "LoadImage_2",
      "ImageScaleToTotalPixels_2",
      "VAEEncode_Reference_2",
      "ReferenceLatent_Positive_2",
      "ReferenceLatent_Negative_2",
    ]);
    expect(keys[anchor + 6]).toBe("Sampler");

    // The prompt still conditions the sample, through the appended pair and the
    // base chain's own pair behind it.
    const positive = conditioningChain(workflow, workflow.Sampler, "positive");
    expect(positive.chain).toEqual([
      "ReferenceLatent_Positive",
      "ReferenceLatent_Positive_2",
    ]);
    expect(positive.conditioningSource).toBe("PositiveCLIP_Base");
    const negative = conditioningChain(workflow, workflow.Sampler, "negative");
    expect(negative.chain).toEqual([
      "ReferenceLatent_Negative",
      "ReferenceLatent_Negative_2",
    ]);
    expect(negative.conditioningSource).toBe("ConditioningZeroOut_Negative");
  });
});
