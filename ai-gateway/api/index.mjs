import myImageUploads from "./my-image-uploads/index.mjs";
import cyImageUploads from "./cy-image-uploads/index.mjs";

/**
 * API route registry for ai-gateway.
 * Each route is { testUrl, serve } and mounted under /api/<module>.
 */
export default [...myImageUploads, ...cyImageUploads];
