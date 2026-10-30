import { useCallback, useRef } from "react";
import {
  entryImagePath,
  isParentEntry,
  joinFolderPath,
} from "../utils/entries";

/**
 * Delete (move-to-trash) flow for the file browser.
 *
 * After a successful trash call the listing is refreshed and the row that now
 * sits at the deleted index becomes the selection, so the viewer and the log
 * column follow the list.
 *
 * @param {object} options
 * @param {string} options.currentPath - Folder the listing is showing.
 * @param {Array<object>} options.entries - Current listing.
 * @param {number} options.selectedIndex - Highlighted row index.
 * @param {string|null} options.selectedImagePath - Path of the displayed image.
 * @param {(entry: object|null, index: number) => void} options.applySelection
 * @param {() => void} options.clearSelectedImage - Empties the viewer.
 * @param {(path: string) => Promise<Array<object>|undefined>} options.fetchDirectory
 * @param {(message: string|null) => void} options.setError
 * @returns {(entry: object) => Promise<void>}
 */
export function useTrashHandler({
  currentPath,
  entries,
  selectedIndex,
  selectedImagePath,
  applySelection,
  clearSelectedImage,
  fetchDirectory,
  setError,
}) {
  // Guard against a second Delete keypress landing before the first trash call
  // and its refresh have resolved.
  const deletingRef = useRef(false);

  return useCallback(
    async (entry) => {
      if (!entry || isParentEntry(entry)) return;
      // A delete is already in flight: ignore further keypresses until the
      // listing has been refreshed, otherwise the stale list is trashed twice.
      if (deletingRef.current) return;

      const deletedIndex = entries.findIndex((e) => e.name === entry.name);
      const itemPath = joinFolderPath(currentPath, entry.name);

      deletingRef.current = true;
      try {
        const response = await fetch("/api/trash", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ paths: [itemPath] }),
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          setError(data?.error || `HTTP ${response.status}`);
          return;
        }

        // /api/trash answers 200 even when individual paths fail, so the body
        // must be inspected before treating the move as successful.
        if (data && data.ok === false) {
          setError(data.errors?.[0]?.error || "Failed to move item to trash");
          return;
        }

        // The trashed entry no longer exists: never leave it in the viewer,
        // even if the refresh below fails.
        if (
          selectedImagePath &&
          selectedImagePath === entryImagePath(currentPath, entry)
        ) {
          clearSelectedImage();
        }

        // Refresh the listing on success
        const newEntries = await fetchDirectory(currentPath);
        if (!Array.isArray(newEntries)) {
          // fetchDirectory already reported the real error for this request.
          return;
        }

        // Focus the entry now sitting at the deleted index (the next one),
        // or the last entry when the deleted one was last.
        const targetIndex = deletedIndex < 0 ? selectedIndex : deletedIndex;
        const newIndex = Math.max(
          0,
          Math.min(targetIndex, newEntries.length - 1),
        );

        // Folder, ".." or an empty listing -> no image: viewer shows empty state
        applySelection(newEntries[newIndex] ?? null, newIndex);
      } catch {
        setError("Failed to move item to trash");
      } finally {
        deletingRef.current = false;
      }
    },
    [
      applySelection,
      clearSelectedImage,
      currentPath,
      entries,
      fetchDirectory,
      selectedIndex,
      selectedImagePath,
      setError,
    ],
  );
}

export default useTrashHandler;
