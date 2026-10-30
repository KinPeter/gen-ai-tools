import { useCallback, useEffect, useRef, useState } from "react";
import {
  MIN_WIDTHS,
  enforceMinWidth,
  parseStoredWidth,
} from "../utils/resize-utils.mjs";

const STORAGE_KEYS = ["dist-browser-col-1", "dist-browser-col-2"];
const DEFAULT_WIDTHS = [300, 500, 300]; // px initial widths
const DEBOUNCE_MS = 80;

function getStoredWidth(key, fallback) {
  if (typeof window === "undefined") return fallback;
  const stored = localStorage.getItem(key);
  return parseStoredWidth(stored, fallback);
}

export function useColumnResize(colCount) {
  const [widths, setWidths] = useState(() => {
    const defaults = [];
    for (let i = 0; i < colCount; i++) {
      defaults.push(getStoredWidth(STORAGE_KEYS[i], DEFAULT_WIDTHS[i]));
    }
    // Last column has no stored width — we handle it as "fill" in CSS
    return defaults;
  });

  const draggingRef = useRef(null);
  const debounceRef = useRef(null);
  const widthsRef = useRef(widths);
  widthsRef.current = widths;

  const clearDebounce = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  const persistWidth = useCallback((index, width) => {
    if (index < STORAGE_KEYS.length) {
      localStorage.setItem(STORAGE_KEYS[index], String(Math.round(width)));
    }
  }, []);

  const startDrag = useCallback(
    (index, clientX) => {
      draggingRef.current = {
        index,
        startX: clientX,
        startWidth: widths[index],
      };
      document.addEventListener("mousemove", onDrag);
      document.addEventListener("mouseup", endDrag);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [widths],
  );

  const onDrag = useCallback(
    (e) => {
      if (!draggingRef.current) return;
      const { index, startX, startWidth } = draggingRef.current;
      const delta = e.clientX - startX;
      const proposedWidth = startWidth + delta;
      const newWidth = enforceMinWidth(MIN_WIDTHS[index], proposedWidth);
      setWidths((prev) => {
        const next = [...prev];
        next[index] = newWidth;
        return next;
      });
      // Debounced write to localStorage
      clearDebounce();
      debounceRef.current = setTimeout(() => {
        persistWidth(index, newWidth);
      }, DEBOUNCE_MS);
    },
    [clearDebounce, persistWidth],
  );

  const endDrag = useCallback(() => {
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", endDrag);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    if (draggingRef.current) {
      const { index } = draggingRef.current;
      // Flush pending debounced write and persist the final width directly
      clearDebounce();
      persistWidth(index, widthsRef.current[index]);
      draggingRef.current = null;
    }
  }, [persistWidth, clearDebounce]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearDebounce();
      document.removeEventListener("mousemove", onDrag);
      document.removeEventListener("mouseup", endDrag);
    };
  }, [clearDebounce, onDrag, endDrag]);

  return {
    widths,
    setWidths,
    startDrag,
    minWidths: MIN_WIDTHS,
  };
}
