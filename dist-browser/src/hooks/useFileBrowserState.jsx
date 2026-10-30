import { useCallback, useState } from "react";
import { entryImagePath } from "../utils/entries";
import { isImageFile } from "../utils/is-image";
import { useDirectoryListing } from "./useDirectoryListing";
import { useTrashHandler } from "./useTrashHandler";

/**
 * Selection and delete (trash) wiring for the folder the layout is showing.
 * The listing itself — fetch, abort, loading and error state — is in
 * `useDirectoryListing`.
 */
export function useFileBrowserState(currentPath, navigateTo) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [selectedImagePath, setSelectedImagePath] = useState(null);

  // A fresh listing starts on the first row. The viewer is emptied when the
  // listing we got is for a different folder than the one we asked for.
  const onListingLoaded = useCallback(
    (listingPath) => {
      setSelectedIndex(0);
      if (listingPath !== currentPath) {
        setSelectedEntry(null);
        setSelectedImagePath(null);
      }
    },
    [currentPath],
  );

  const { entries, loading, error, setError, refresh, fetchDirectory } =
    useDirectoryListing(currentPath, navigateTo, onListingLoaded);

  // Single place that keeps selectedIndex, selectedEntry and selectedImagePath
  // in sync. selectedEntry is only ever an image, so the highlighted list row,
  // the viewer and the log column always agree.
  const applySelection = useCallback(
    (entry, index) => {
      setSelectedIndex(Math.max(0, index));
      setSelectedEntry(isImageFile(entry) ? entry : null);
      setSelectedImagePath(entryImagePath(currentPath, entry));
    },
    [currentPath],
  );

  const selectEntry = useCallback(
    (entry) => {
      if (!entry) return;

      const index = entries.findIndex((e) => e.name === entry.name);
      if (index < 0) return;

      applySelection(entry, index);
    },
    [entries, applySelection],
  );

  // Empties the viewer without touching the highlighted row.
  const clearSelectedImage = useCallback(() => {
    setSelectedEntry(null);
    setSelectedImagePath(null);
  }, []);

  const deleteEntry = useTrashHandler({
    currentPath,
    entries,
    selectedIndex,
    selectedImagePath,
    applySelection,
    clearSelectedImage,
    fetchDirectory,
    setError,
  });

  return {
    entries,
    loading,
    error,
    selectedIndex,
    selectedEntry,
    selectedImagePath,
    selectEntry,
    deleteEntry,
    refresh,
  };
}

export default useFileBrowserState;
