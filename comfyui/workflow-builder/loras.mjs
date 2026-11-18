import {
  findModelLoader,
  insertNodesAfter,
  rewireLoaderRefs,
} from "./utils.mjs";

// One node shape per loader kind. The queue API is order-independent, but the
// committed golden files pin key order (JSON.stringify emits keys in insertion
// order), so this shape order is load-bearing for them: the checkpoint node
// lists its links first, the model-only node the LoRA settings first.
// Reordering here rewrites the LoRA nodes of every affected golden.
const LORA_NODE_SHAPES = {
  modelOnly: (prev, lora) => ({
    class_type: "LoraLoaderModelOnly",
    inputs: {
      lora_name: lora.name,
      strength_model: lora.strength,
      model: [prev, 0],
    },
  }),
  checkpoint: (prev, lora) => ({
    class_type: "LoraLoader",
    inputs: {
      model: [prev, 0],
      clip: [prev, 1],
      lora_name: lora.name,
      strength_model: lora.strength,
      strength_clip: lora.strength,
    },
  }),
};

/**
 * Build the ordered Lora_1..Lora_N node dict for the loader's wiring style: a
 * checkpoint chains LoraLoader nodes with model + clip links, a model-only
 * loader (UNETLoader) chains LoraLoaderModelOnly nodes with a model link only.
 * Pure — the workflow is not touched.
 */
export function buildLoraChain(loader, loras) {
  const shape = LORA_NODE_SHAPES[loader.modelOnly ? "modelOnly" : "checkpoint"];
  const chain = {};
  let prev = loader.label;
  for (const [index, lora] of loras.entries()) {
    const label = `Lora_${index + 1}`;
    chain[label] = shape(prev, lora);
    prev = label;
  }
  return chain;
}

/**
 * Wire the item's LoRAs into the workflow: chain them after the base workflow's
 * model loader and move that loader's consumers onto the last LoRA.
 */
export function applyLoras(workflow, item) {
  const loader = findModelLoader(workflow);
  if (loader === undefined) {
    throw new Error(
      '"loras" requires a CheckpointLoaderSimple or UNETLoader node in the base workflow',
    );
  }

  const labels = item.loras.map((_, i) => `Lora_${i + 1}`);
  for (const label of labels) {
    if (label in workflow) {
      throw new Error(
        `"loras" cannot be applied: the base workflow already defines a node labeled "${label}"`,
      );
    }
  }

  const chain = buildLoraChain(loader, item.loras);
  const lastLabel = labels[labels.length - 1];
  // Rewire before inserting: Lora_1 hangs off the loader itself, so rewiring
  // afterwards would move its own link onto the last LoRA of the chain.
  rewireLoaderRefs(workflow, loader.label, lastLabel, loader.clipOutput);
  insertNodesAfter(workflow, loader.label, chain);
}
