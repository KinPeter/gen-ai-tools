import { createImageUploadsRoutes } from "../shared/image-uploads/index.mjs";

/**
 * API route registry for the cy-image-uploads module.
 * Endpoints operate on the folder from AIGW_CY_IMAGE_UPLOADS_FOLDER.
 */
export default createImageUploadsRoutes({
  prefix: "/api/cy-image-uploads",
  envVar: "AIGW_CY_IMAGE_UPLOADS_FOLDER",
  label: "cy-image-uploads",
});
