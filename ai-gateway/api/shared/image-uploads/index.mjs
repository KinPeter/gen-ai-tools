import { createListRoute } from "./list.mjs";
import { createDeleteRoute } from "./delete.mjs";
import { createUploadRoute } from "./upload.mjs";

/**
 * API route registry builder for an image-uploads module.
 *
 * @param {{ prefix: string, envVar: string, label: string }} ctx
 *   prefix - route prefix, e.g. "/api/my-image-uploads"
 *   envVar - env var holding the folder path, e.g. "AIGW_MY_IMAGE_UPLOADS_FOLDER"
 *   label  - log-line prefix, e.g. "my-image-uploads"
 * @returns {Array<{ testUrl: (url: string) => boolean, serve: Function }>} list,
 *   delete and upload routes in that order
 */
export function createImageUploadsRoutes(ctx) {
  return [createListRoute(ctx), createDeleteRoute(ctx), createUploadRoute(ctx)];
}
