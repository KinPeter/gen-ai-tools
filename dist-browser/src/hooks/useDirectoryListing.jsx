import { useCallback, useEffect, useRef, useState } from "react";
import { parentEntry, sortEntries } from "../utils/entries";
import { writeLastFolder } from "../utils/last-folder";

/**
 * The listing of one folder: fetching (with abort of a request that is made
 * obsolete by a new one), the loading/error state, and the fallback to the
 * dist root when the folder is gone (404) or rejected (403).
 *
 * `onListingLoaded` is called with every fresh listing so the caller can reset
 * its selection in the same React update batch as the entries: a reset in a
 * later effect would run after the delete flow has already re-selected the
 * row that follows the trashed one.
 *
 * @param {string} currentPath - Folder being listed.
 * @param {(path: string) => void} navigateTo - Moves the layout to another path.
 * @param {(entries: Array<object>, listingPath: string) => void} onListingLoaded
 * @returns {object} Listing state plus `refresh` and `fetchDirectory`.
 */
export function useDirectoryListing(currentPath, navigateTo, onListingLoaded) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const abortRef = useRef(null);

  // `navigateTo` is memoised by Layout, but it is read through a ref so a
  // caller that hands over a new function every render cannot change
  // fetchDirectory's identity and re-run the load effect on every render.
  const navigateToRef = useRef(navigateTo);
  navigateToRef.current = navigateTo;

  // Fetch a directory listing
  const fetchDirectory = useCallback(
    async (path) => {
      // Abort any in-flight request
      if (abortRef.current) {
        abortRef.current.abort();
      }

      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const url = path ? `/api/fs/${encodeURIComponent(path)}` : "/api/fs/";
        const response = await fetch(url, {
          signal: controller.signal,
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          const requestError = new Error(
            data?.error || `HTTP ${response.status}`,
          );
          requestError.status = response.status;
          throw requestError;
        }

        const data = await response.json();

        // Sort: folders first (alphabetical, case-insensitive), then files,
        // then prepend the virtual ".." parent entry (after sorting).
        const sorted = sortEntries(data.entries);
        const parent = parentEntry(currentPath);
        const allEntries = parent ? [parent, ...sorted] : sorted;

        setEntries(allEntries);
        onListingLoaded?.(allEntries, data.path);

        return allEntries;
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message || "Failed to load directory");
          // The folder we asked for cannot be used: it is gone (404) or the
          // path was rejected by the server (403). Fall back to the dist root
          // and clear the entry here so a reload does not repeat the failure.
          // Transient errors (5xx, network) keep the entry so the user can
          // retry the same folder.
          if (path && (err.status === 404 || err.status === 403)) {
            writeLastFolder("");
            navigateToRef.current("");
          }
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [currentPath, onListingLoaded],
  );

  // Initial load and path change
  useEffect(() => {
    fetchDirectory(currentPath);
  }, [currentPath, fetchDirectory]);

  const refresh = useCallback(
    () => fetchDirectory(currentPath),
    [fetchDirectory, currentPath],
  );

  return { entries, loading, error, setError, refresh, fetchDirectory };
}

export default useDirectoryListing;
