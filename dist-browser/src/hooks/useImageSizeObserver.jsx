import { useCallback, useEffect, useRef, useState } from "react";

/**
 * ResizeObserver-based hook that detects when the image fills the column.
 *
 * The `setTallEnoughOverride` function updates an internal ref (synchronous,
 * no re-render). A useEffect then compares the ref value against the last
 * applied value and only triggers a re-render when the override actually
 * changed — preventing infinite render loops when the component passes the
 * same override on every render.
 *
 * @param {string|null} imagePath - Image path (triggers observer when truthy).
 * @returns {{
 *   containerRef: React.RefObject,
 *   imageRef: React.RefObject,
 *   tallEnough: boolean,
 *   setTallEnoughOverride: (val: boolean | null) => void
 * }}
 */
export function useImageSizeObserver(imagePath) {
  const containerRef = useRef(null);
  const imageRef = useRef(null);
  const observerRef = useRef(null);

  // Internal state — used when no override is provided.
  const [isTallInternal, setIsTallInternal] = useState(false);

  // Force a re-render when the override value changes.
  const [, setToggler] = useState(0);

  // Synchronous override storage — updated directly during render by the
  // component so tallEnough is correct in the same render pass.
  const overrideRef = useRef(null);

  // Track the last value passed to setTallEnoughOverride so we only
  // re-render when the value actually changes.
  const lastOverrideRef = useRef(null);

  const setTallEnoughOverride = useCallback((val) => {
    overrideRef.current = val;
  }, []);

  // When the override ref changes, schedule a re-render so the new value
  // flows into tallEnough for the next render cycle.  Only re-render when
  // the value actually changed — the component calls setTallEnoughOverride
  // on every render so we must guard against infinite loops.
  useEffect(() => {
    const val = overrideRef.current;
    if (val !== lastOverrideRef.current) {
      lastOverrideRef.current = val;
      setToggler((t) => t + 1);
    }
  });

  const tallEnough =
    overrideRef.current !== null ? overrideRef.current : isTallInternal;

  useEffect(() => {
    if (!imagePath || !containerRef.current) return;

    const container = containerRef.current;

    observerRef.current = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const containerHeight = entry.contentRect.height;
        if (containerHeight < 1) continue;

        const img =
          imageRef.current ?? container.querySelector(".image-viewer-image");
        if (!img) continue;

        const imgHeight = img.getBoundingClientRect().height;
        setIsTallInternal(imgHeight >= containerHeight);
      }
    });

    observerRef.current.observe(container);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [imagePath]);

  return { containerRef, imageRef, tallEnough, setTallEnoughOverride };
}
