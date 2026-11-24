import { createImageUploadsRoutes } from "../shared/image-uploads/index.mjs";

/**
 * API route registry for the my-image-uploads module.
 * Endpoints operate on the folder from AIGW_MY_IMAGE_UPLOADS_FOLDER.
 */
export default createImageUploadsRoutes({
  prefix: "/api/my-image-uploads",
  envVar: "AIGW_MY_IMAGE_UPLOADS_FOLDER",
  label: "my-image-uploads",
});
