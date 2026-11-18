import { findNode, findNodeByClass, insertNodesAfter } from "./utils.mjs";

/**
 * Determine the clip source label for a ClipSkip_Base node.
 * Without LoRAs → the model loader label; with LoRAs → the last LoRA label
 * (e.g. "Lora_2").
 */
export function findClipSourceLabel(workflow, loras, modelLoaderLabel) {
  if (loras && Array.isArray(loras) && loras.length > 0) {
    return `Lora_${loras.length}`;
  }
  return modelLoaderLabel;
}

/**
 * Create a ClipSkip_Base node and insert it after the base workflow's model
 * loader. The clip input references the loader's CLIP output (or the last
 * LoRA when LoRAs are already applied); only the key-order anchor is the
 * loader, so insertion stays stable regardless of whether LoRAs are present.
 *
 * @param {object} workflow - The workflow object.
 * @param {number} clipSkipValue - The clip-skip value to set.
 * @param {string} clipSourceLabel - The node label that provides the clip input (model loader or last LoRA).
 * @param {string} anchorLabel - The workflow key the new node is inserted after (the model loader).
 * @returns {string} The label used ("ClipSkip_Base").
 */
export function createClipSkipNode(
  workflow,
  clipSkipValue,
  clipSourceLabel,
  anchorLabel,
) {
  const label = "ClipSkip_Base";

  insertNodesAfter(workflow, anchorLabel, {
    [label]: {
      class_type: "CLIPSetLastLayer",
      inputs: {
        clip: [clipSourceLabel, 1],
        stop_at_clip_layer: clipSkipValue,
      },
    },
  });

  return label;
}

/**
 * Rewire positive and negative clip nodes to read from clipSkipLabel.
 * Uses sampler inputs first, then falls back to node lookup.
 */
export function rewireClipsTo(wf, clipSkipLabel, sampler) {
  // Find positive clip node
  const posRef = sampler?.inputs?.positive?.[0];
  let posClip;
  if (typeof posRef === "string" && wf[posRef]) {
    posClip = wf[posRef];
  } else {
    // fallback: prefer PositiveCLIP_Base (matching findPositiveClip logic),
    // then general CLIPTextEncode lookup (ClipSkip_Base is CLIPSetLastLayer,
    // so findNodeByClass("CLIPTextEncode") won't return it)
    posClip =
      wf.PositiveCLIP_Base ?? findNodeByClass(wf, "CLIPTextEncode")?.node;
  }

  // Find negative clip node
  const negRef = sampler?.inputs?.negative?.[0];
  let negClip;
  if (typeof negRef === "string" && wf[negRef]) {
    negClip = wf[negRef];
  } else {
    // fallback: use NegativeCLIP_Base if present, else find a CLIPTextEncode
    // that's not the positive clip and not ClipSkip_Base
    negClip = wf.NegativeCLIP_Base;
    if (!negClip) {
      for (const [label, node] of Object.entries(wf)) {
        if (node?.class_type === "CLIPTextEncode" && label !== clipSkipLabel) {
          if (node !== posClip) {
            negClip = node;
            break;
          }
        }
      }
    }
  }

  // Rewire found clips to point to ClipSkip_Base
  if (posClip) posClip.inputs.clip = [clipSkipLabel, 0];
  if (negClip) negClip.inputs.clip = [clipSkipLabel, 0];
}

/**
 * Apply clip-skip override (create node if missing, override value if exists).
 * Expects LoRAs to already be applied (clip source must be correct).
 * Creating the node needs a loader with a CLIP output, so a model-only base
 * (UNETLoader) fails instead of leaving the CLIP nodes on an uninserted node.
 */
export function applyClipSkipOverride(
  workflow,
  clipSkipValue,
  loras,
  loader,
  sampler,
) {
  const clipSkipNode = findNode(workflow, "CLIPSetLastLayer");
  if (clipSkipNode == null) {
    // ClipSkip_Base does NOT exist — CREATE it and rewire clips. Only a
    // checkpoint loader has the CLIP output this node reads.
    if (loader == null || loader.clipOutput == null) {
      throw new Error(
        '"clip-skip" requires a CheckpointLoaderSimple node in the base workflow',
      );
    }
    const clipSourceLabel = findClipSourceLabel(workflow, loras, loader.label);
    const clipSkipLabel = createClipSkipNode(
      workflow,
      clipSkipValue,
      clipSourceLabel,
      loader.label,
    );
    rewireClipsTo(workflow, clipSkipLabel, sampler);
  } else {
    // ClipSkip_Base exists — just override the value (existing behavior)
    clipSkipNode.inputs.stop_at_clip_layer = clipSkipValue;
  }
}
