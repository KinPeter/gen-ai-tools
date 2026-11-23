export function findNode(workflow, classType) {
  for (const node of Object.values(workflow)) {
    if (node?.class_type === classType) return node;
  }
  return undefined;
}

export function findPositiveClip(workflow, sampler) {
  if (workflow.PositiveCLIP_Base) return workflow.PositiveCLIP_Base;
  const ref = sampler?.inputs?.positive?.[0];
  if (
    typeof ref === "string" &&
    workflow[ref] &&
    workflow[ref].class_type === "CLIPTextEncode"
  )
    return workflow[ref];
  return findNode(workflow, "CLIPTextEncode");
}

export function findNegativeClip(workflow, sampler) {
  if (workflow.NegativeCLIP_Base) return workflow.NegativeCLIP_Base;
  const ref = sampler?.inputs?.negative?.[0];
  if (typeof ref === "string" && workflow[ref]) return workflow[ref];
  const positive = findPositiveClip(workflow, sampler);
  for (const node of Object.values(workflow)) {
    if (node?.class_type === "CLIPTextEncode" && node !== positive) return node;
  }
  return undefined;
}

export function getRandomSeed() {
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
}

/**
 * Find a node by class_type and return { label, node } or undefined.
 */
export function findNodeByClass(workflow, classType) {
  for (const [label, node] of Object.entries(workflow)) {
    if (node?.class_type === classType) return { label, node };
  }
  return undefined;
}

// Base-workflow model loaders in lookup precedence order: a base with both
// classes resolves to the checkpoint. `clipOutput` is the loader's CLIP output
// index (null when it outputs only the model), `nameInput` names the model file.
const MODEL_LOADERS = [
  {
    classType: "CheckpointLoaderSimple",
    modelOnly: false,
    clipOutput: 1,
    nameInput: "ckpt_name",
  },
  {
    classType: "UNETLoader",
    modelOnly: true,
    clipOutput: null,
    nameInput: "unet_name",
  },
];

/**
 * Which model loader the base workflow uses: { label, node, modelOnly,
 * clipOutput, nameInput } or undefined when it has neither loader class.
 */
export function findModelLoader(workflow) {
  for (const loader of MODEL_LOADERS) {
    const found = findNodeByClass(workflow, loader.classType);
    if (!found) continue;
    return {
      label: found.label,
      node: found.node,
      modelOnly: loader.modelOnly,
      clipOutput: loader.clipOutput,
      nameInput: loader.nameInput,
    };
  }
  return undefined;
}

/**
 * Move every consumer of the loader labeled fromLabel onto another node: model
 * references (output index 0) always move, CLIP references only when
 * clipOutput is 1 — index 1 is the only CLIP output the MODEL_LOADERS table
 * exposes — and VAE references (index 2) never. Rewires only the nodes present
 * now, so a chain inserted afterwards keeps its own links.
 */
export function rewireLoaderRefs(workflow, fromLabel, toLabel, clipOutput) {
  for (const node of Object.values(workflow)) {
    const inputs = node?.inputs;
    if (!inputs || typeof inputs !== "object") continue;
    for (const [key, value] of Object.entries(inputs)) {
      if (!Array.isArray(value) || value.length !== 2) continue;
      if (value[0] !== fromLabel) continue;
      if (value[1] === 0) inputs[key] = [toLabel, 0];
      else if (value[1] === 1 && clipOutput === 1) inputs[key] = [toLabel, 1];
    }
  }
}

/**
 * Insert newNodes immediately after the node labeled anchorLabel, leaving every
 * other key in place. The queue API is order-independent, but the committed
 * golden files store key order, so the insertion position is load-bearing for
 * them: callers anchor each node kind at the same place (LoRAs and ClipSkip
 * anchor after the model loader). An unknown anchor changes nothing.
 */
export function insertNodesAfter(workflow, anchorLabel, newNodes) {
  const originalKeys = Object.keys(workflow);
  const values = {};
  for (const key of originalKeys) values[key] = workflow[key];
  for (const key of originalKeys) delete workflow[key];
  const anchorIndex = originalKeys.indexOf(anchorLabel);
  for (let i = 0; i < originalKeys.length; i++) {
    const key = originalKeys[i];
    workflow[key] = values[key];
    if (i === anchorIndex) {
      for (const [label, node] of Object.entries(newNodes)) {
        workflow[label] = node;
      }
    }
  }
}

/**
 * Name of the diffusion model the workflow loads: a checkpoint when the base
 * workflow has a CheckpointLoaderSimple, otherwise a standalone UNET loader
 * (Krea2-style workflows load the model with UNETLoader).
 */
export function getModelName(workflow) {
  const loader = findModelLoader(workflow);
  if (!loader) return undefined;
  return loader.node?.inputs?.[loader.nameInput];
}

export function getFinalLogDataFromWorkflow(workflow) {
  const sampler = findNode(workflow, "KSampler") ?? workflow.Sampler;
  return {
    positivePrompt: findPositiveClip(workflow, sampler)?.inputs?.text,
    negativePrompt: findNegativeClip(workflow, sampler)?.inputs?.text,
    seed: sampler?.inputs?.seed,
    steps: sampler?.inputs?.steps,
    cfg: sampler?.inputs?.cfg,
    sampler: sampler?.inputs?.["sampler_name"],
    scheduler: sampler?.inputs?.scheduler,
    model: getModelName(workflow),
  };
}
