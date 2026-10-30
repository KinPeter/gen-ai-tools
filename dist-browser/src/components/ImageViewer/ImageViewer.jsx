import "./ImageViewer.css";

/**
 * Image Viewer column: the selected image, or the empty state.
 *
 * @param {object} props
 * @param {string|null} props.imagePath - Path of the selected image relative to
 *   the dist root, or null when nothing is selected.
 * @param {string|undefined} props.alt - Name of the selected entry.
 */
export function ImageViewer({ imagePath, alt }) {
  if (!imagePath) {
    return (
      <div className="image-viewer-empty" role="status">
        No image selected
      </div>
    );
  }

  return (
    <div className="image-viewer-placeholder">
      <img
        src={`/api/images/${encodeURIComponent(imagePath)}`}
        alt={alt}
        className="image-viewer-image"
      />
    </div>
  );
}

export default ImageViewer;
