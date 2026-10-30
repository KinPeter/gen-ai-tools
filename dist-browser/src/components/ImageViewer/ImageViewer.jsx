import { useRef } from "react";
import "./ImageViewer.css";
import { useImageLoadState } from "../../hooks/useImageLoadState";
import { useImageSizeObserver } from "../../hooks/useImageSizeObserver";
import { buildImageUrl } from "../../utils/image-url.mjs";

/**
 * Image Viewer column: the selected image, or the empty state.
 *
 * @param {object} props
 * @param {string|null} props.imagePath - Path of the selected image relative to
 *   the dist root, or null when nothing is selected.
 * @param {string|undefined} props.alt - Name of the selected entry.
 * @param {boolean|undefined} props.isTallEnough - Test-only override: when
 *   true the filename overlay is shown instead of the below-label.
 */
export function ImageViewer({ imagePath, alt, isTallEnough }) {
  // ── Custom hooks ────────────────────────────────────────────────────────
  const loadState = useImageLoadState();
  const sizeObserver = useImageSizeObserver(imagePath);
  const imageSrc = buildImageUrl(imagePath);

  // ── Dev-only guard for test-only prop (fires once) ────────────────────────
  const warnedRef = useRef(false);
  if (
    import.meta.env?.DEV &&
    typeof isTallEnough === "boolean" &&
    !warnedRef.current
  ) {
    warnedRef.current = true;
    console.warn("isTallEnough is for testing only — remove it in production");
  }

  // Allow test to override the tallEnough value
  const effectiveTall = sizeObserver.tallEnough;
  if (typeof isTallEnough === "boolean") {
    sizeObserver.setTallEnoughOverride(isTallEnough);
  }

  // ── Filename text ───────────────────────────────────────────────────────
  const fileName = alt || imagePath;

  // ── Empty state ─────────────────────────────────────────────────────────
  if (!imagePath) {
    return (
      <div className="image-viewer-empty" role="status">
        No image selected
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="image-viewer-placeholder" ref={sizeObserver.containerRef}>
      {/* Loading indicator */}
      {!loadState.isLoaded && !loadState.hasError && (
        <div
          className="image-viewer-loading"
          aria-label="Loading image"
          aria-busy="true"
        >
          <span className="image-viewer-spinner" />
        </div>
      )}

      {/* Image */}
      <img
        key={loadState.imgKey}
        src={imageSrc}
        alt={fileName}
        className="image-viewer-image"
        ref={sizeObserver.imageRef}
        onLoad={loadState.onLoad}
        onError={loadState.onError}
      />

      {/* Error state */}
      {loadState.hasError && !loadState.isLoaded && (
        <div className="image-viewer-error" role="alert">
          Failed to load image
          <button className="image-viewer-retry" onClick={loadState.onRetry}>
            Retry
          </button>
        </div>
      )}

      {/* Filename label — shown below the image when the image is NOT tall enough */}
      {!effectiveTall && !loadState.hasError && (
        <div className="image-viewer-filename-label">{fileName}</div>
      )}

      {/* Filename overlay — shown when the image IS tall enough */}
      {effectiveTall && !loadState.hasError && (
        <div className="image-viewer-filename-overlay">
          <span>{fileName}</span>
        </div>
      )}
    </div>
  );
}

export default ImageViewer;
