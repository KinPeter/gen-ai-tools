export function findNode(workflow, classType) {
  for (const node of Object.values(workflow)) {
    if (node?.class_type === classType) return node;
  }
  return undefined;
}

export function findNodeLabel(workflow, classType) {
  for (const [label, node] of Object.entries(workflow)) {
    if (node?.class_type === classType) return label;
  }
  return undefined;
}

export function findPositiveClip(workflow, sampler) {
  const ref = sampler?.inputs?.positive?.[0];
  if (typeof ref === "string" && workflow[ref]) return workflow[ref];
  return workflow.PositiveCLIP_Base ?? findNode(workflow, "CLIPTextEncode");
}

export function findNegativeClip(workflow, sampler) {
  const ref = sampler?.inputs?.negative?.[0];
  if (typeof ref === "string" && workflow[ref]) return workflow[ref];
  if (workflow.NegativeCLIP_Base) return workflow.NegativeCLIP_Base;
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

/**
 * Name of the diffusion model the workflow loads: a checkpoint when the base
 * workflow has a CheckpointLoaderSimple, otherwise a standalone UNET loader
 * (Krea2-style workflows load the model with UNETLoader).
 */
export function getModelName(workflow) {
  const checkpointLoader = findNode(workflow, "CheckpointLoaderSimple");
  if (checkpointLoader) return checkpointLoader.inputs?.["ckpt_name"];

  const unetLoader = findNode(workflow, "UNETLoader");
  return unetLoader?.inputs?.["unet_name"];
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
