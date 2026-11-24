import { findNodeByClass, insertNodesAfter } from "./utils.mjs";

// "inputs" filenames in YAML order drive the base workflow's reference-image
// chain: the LoadImage that carries the picture, the ImageScaleToTotalPixels
// that sizes it, the VAEEncode_Reference its latent comes from, and the
// ReferenceLatent pair that conditions the KSampler. Those labels are
// conventional, so a base that names the single-node kinds differently is still
// found by class_type; the pair shares its class, so its ends are read from the
// sampler's own links instead.
const REFERENCE_CLASS = "ReferenceLatent";

/**
 * Label of a chain node: `baseLabel` when it carries `classType`, otherwise the
 * first node of that class in key order. Pass only the class when the label is
 * the class name.
 */
export function findChainLabel(workflow, classType, baseLabel = classType) {
  if (workflow[baseLabel]?.class_type === classType) return baseLabel;
  return findNodeByClass(workflow, classType)?.label;
}

/**
 * Label of the ReferenceLatent end the KSampler reads as positive or negative,
 * falling back to its conventional label. Reading the sampler first means a
 * base that already chains several ReferenceLatent nodes extends from the end
 * it actually uses.
 */
export function findReferenceEndLabel(workflow, sampler, side, baseLabel) {
  const linked = sampler?.inputs?.[side]?.[0];
  if (workflow[linked]?.class_type === REFERENCE_CLASS) return linked;
  return workflow[baseLabel]?.class_type === REFERENCE_CLASS
    ? baseLabel
    : undefined;
}

/**
 * Labels of the base workflow's single reference-image chain:
 * { loadImage, imageScale, vaeEncode, positiveRef, negativeRef }. A base that
 * is missing one of them cannot carry input images, so it fails with the node
 * names rather than leaving dangling links.
 */
export function findInputImageChain(workflow, sampler) {
  const chain = {
    loadImage: findChainLabel(workflow, "LoadImage"),
    imageScale: findChainLabel(workflow, "ImageScaleToTotalPixels"),
    vaeEncode: findChainLabel(workflow, "VAEEncode", "VAEEncode_Reference"),
    positiveRef: findReferenceEndLabel(
      workflow,
      sampler,
      "positive",
      "ReferenceLatent_Positive",
    ),
    negativeRef: findReferenceEndLabel(
      workflow,
      sampler,
      "negative",
      "ReferenceLatent_Negative",
    ),
  };
  if (Object.values(chain).some((label) => label == null)) {
    throw new Error(
      '"inputs" requires a LoadImage, ImageScaleToTotalPixels, VAEEncode_Reference and ReferenceLatent chain in the base workflow',
    );
  }
  return chain;
}

/**
 * LoadImage and ImageScaleToTotalPixels nodes for the extra images, the scaling
 * settings copied from the base chain so every image is sized alike.
 */
export function buildImageLoadNodes(indexes, filenames, baseScaleInputs) {
  const nodes = {};
  for (const i of indexes) {
    const loadLabel = `LoadImage_${i}`;
    nodes[loadLabel] = {
      class_type: "LoadImage",
      inputs: { image: filenames[i - 1] },
    };
    nodes[`ImageScaleToTotalPixels_${i}`] = {
      class_type: "ImageScaleToTotalPixels",
      inputs: {
        image: [loadLabel, 0],
        upscale_method: baseScaleInputs.upscale_method,
        megapixels: baseScaleInputs.megapixels,
        resolution_steps: baseScaleInputs.resolution_steps,
      },
    };
  }
  return nodes;
}

/** VAEEncode nodes for the extra images, each reading the base chain's VAE. */
export function buildVaeEncodeNodes(indexes, baseVaeLink) {
  const nodes = {};
  for (const i of indexes) {
    nodes[`VAEEncode_Reference_${i}`] = {
      class_type: "VAEEncode",
      inputs: {
        pixels: [`ImageScaleToTotalPixels_${i}`, 0],
        vae: [baseVaeLink[0], baseVaeLink[1]],
      },
    };
  }
  return nodes;
}

/**
 * ReferenceLatent nodes for the extra images: each conditioning input comes
 * from the previous image's same-side node, seeded from the base chain's end,
 * so both conditioning chains run through every image and the last image is
 * read by the KSampler.
 */
export function buildReferenceNodes(indexes, chain) {
  const nodes = {};
  for (const side of ["Positive", "Negative"]) {
    const kind = side === "Positive" ? "positiveRef" : "negativeRef";
    for (const i of indexes) {
      const seed = i === 2 ? chain[kind] : `ReferenceLatent_${side}_${i - 1}`;
      nodes[`ReferenceLatent_${side}_${i}`] = {
        class_type: REFERENCE_CLASS,
        inputs: {
          conditioning: [seed, 0],
          latent: [`VAEEncode_Reference_${i}`, 0],
        },
      };
    }
  }
  return nodes;
}

/**
 * Build the nodes for input images 2..N, grouped the way a hand-built
 * multi-image reference chain is grouped (load and scale pairs, then the VAE
 * encodes, then the two conditioning chains). Pure — the workflow is not
 * touched, so callers read the base chain before inserting the result.
 */
export function buildInputImageNodes(workflow, chain, filenames) {
  const indexes = filenames.slice(1).map((_, i) => i + 2);
  return {
    ...buildImageLoadNodes(
      indexes,
      filenames,
      workflow[chain.imageScale].inputs,
    ),
    ...buildVaeEncodeNodes(indexes, workflow[chain.vaeEncode].inputs.vae),
    ...buildReferenceNodes(indexes, chain),
  };
}

/**
 * Apply the block's "inputs" image list, in YAML order: the first filename
 * always lands on the base chain's LoadImage. Every extra image brings its own
 * labeled chain in after the base reference nodes, and the KSampler's
 * conditioning moves onto the last ReferenceLatent pair so it reads the whole
 * chain.
 */
export function applyInputImageOverrides(workflow, sampler, item) {
  const filenames = item?.inputs;
  if (filenames == null || filenames.length === 0) return;

  const chain = findInputImageChain(workflow, sampler);
  workflow[chain.loadImage].inputs.image = filenames[0];
  if (filenames.length === 1) return;

  const nodes = buildInputImageNodes(workflow, chain, filenames);
  insertNodesAfter(workflow, chain.negativeRef, nodes);

  const last = filenames.length;
  sampler.inputs.positive = [`ReferenceLatent_Positive_${last}`, 0];
  sampler.inputs.negative = [`ReferenceLatent_Negative_${last}`, 0];
}
