import { useState } from "react";

/**
 * Image load state management.
 * @returns {{ isLoaded: boolean, hasError: boolean, imgKey: number, onLoad: () => void, onError: () => void, onRetry: () => void }}
 */
export function useImageLoadState() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [imgKey, setImgKey] = useState(0);

  const onLoad = () => {
    setIsLoaded(true);
    setHasError(false);
  };

  const onError = () => {
    setIsLoaded(false);
    setHasError(true);
  };

  const onRetry = () => {
    setHasError(false);
    setImgKey((prev) => prev + 1);
  };

  return { isLoaded, hasError, imgKey, onLoad, onError, onRetry };
}
