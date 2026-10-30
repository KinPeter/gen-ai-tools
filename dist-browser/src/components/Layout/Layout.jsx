import { useCallback, useEffect, useRef, useState } from "react";
import { useColumnResize } from "../../hooks/useColumnResize";
import { TopBar } from "../TopBar/TopBar";
import { Column } from "../Column/Column";
import { ResizeHandle } from "../ResizeHandle/ResizeHandle";
import { FileBrowser } from "../FileBrowser/FileBrowser";
import { isImageFile } from "../../utils/is-image";
import {
  normalizeFolderPath,
  readLastFolder,
  writeLastFolder,
} from "../../utils/last-folder";
import "./Layout.css";

// Path of an entry relative to the served dist root, or null when the entry
// is not an image (folder, "..", or no selection at all).
function entryImagePath(currentPath, entry) {
  if (!isImageFile(entry)) return null;
  return currentPath ? `${currentPath}/${entry.name}` : entry.name;
}

export function Layout() {
  const { widths, startDrag } = useColumnResize(3);

  const [currentPath, setCurrentPath] = useState(() => readLastFolder());
  const [entries, setEntries] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedImagePath, setSelectedImagePath] = useState(null);

  const abortRef = useRef(null);
  // Guard against a second Delete keypress landing before the first trash
  // call and its refresh have resolved.
  const deletingRef = useRef(false);

  // Layout owns currentPath, so it is the only writer of the "last visited
  // folder" entry: the dist root removes the entry, any other path stores the
  // normalized path. FileBrowser never touches storage.
  useEffect(() => {
    writeLastFolder(currentPath);
  }, [currentPath]);

  // Fetch directory listing
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
          const error = new Error(data?.error || `HTTP ${response.status}`);
          error.status = response.status;
          throw error;
        }

        const data = await response.json();
        // Sort: folders first (alphabetical, case-insensitive), then files
        const sorted = (data.entries || []).sort((a, b) => {
          const aIsFolder = a.type === "folder";
          const bIsFolder = b.type === "folder";
          if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
          return a.name.localeCompare(b.name, undefined, {
            sensitivity: "base",
          });
        });
        // Prepend virtual ".." parent folder entry (after sorting)
        const parentEntry = currentPath ? { name: "..", type: "folder" } : null;
        const allEntries = parentEntry ? [parentEntry, ...sorted] : sorted;
        setEntries(allEntries);
        setSelectedIndex(0);
        // Reset selection if current path changed
        if (data.path !== currentPath) {
          setSelectedEntry(null);
          setSelectedImagePath(null);
        }
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
            setCurrentPath("");
          }
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [currentPath],
  );

  // Initial load and path change
  useEffect(() => {
    fetchDirectory(currentPath);
  }, [currentPath, fetchDirectory]);

  const handleNavigate = useCallback((path) => {
    setCurrentPath(normalizeFolderPath(path));
  }, []);

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

  const handleSelect = useCallback(
    (entry) => {
      if (!entry) return;

      const index = entries.findIndex((e) => e.name === entry.name);
      if (index < 0) return;

      applySelection(entry, index);
    },
    [entries, applySelection],
  );

  const handleDelete = useCallback(
    async (entry) => {
      if (!entry || entry.name === "..") return;
      // A delete is already in flight: ignore further keypresses until the
      // listing has been refreshed, otherwise the stale list is trashed twice.
      if (deletingRef.current) return;

      const deletedIndex = entries.findIndex((e) => e.name === entry.name);
      const itemPath = currentPath
        ? `${currentPath}/${entry.name}`
        : entry.name;

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
          setSelectedEntry(null);
          setSelectedImagePath(null);
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
      currentPath,
      entries,
      fetchDirectory,
      selectedIndex,
      selectedImagePath,
    ],
  );

  const handleRefresh = useCallback(() => {
    fetchDirectory(currentPath);
  }, [fetchDirectory, currentPath]);

  const colMinWidths = [200, 300, 300];

  return (
    <div className="app-layout">
      <TopBar onRefresh={handleRefresh} />
      <div className="columns-container">
        <Column
          title="File Browser"
          flexBasis={widths[0]}
          style={{ minWidth: colMinWidths[0] }}
        >
          <FileBrowser
            currentPath={currentPath}
            entries={entries}
            selectedIndex={selectedIndex}
            loading={loading}
            error={error}
            onNavigate={handleNavigate}
            onSelect={handleSelect}
            onDelete={handleDelete}
            onRefresh={handleRefresh}
          />
        </Column>
        <ResizeHandle index={0} width={widths[0]} onStartDrag={startDrag} />
        <Column
          title="Image Viewer"
          flexBasis={widths[1]}
          style={{ minWidth: colMinWidths[1] }}
        >
          {selectedImagePath ? (
            <div className="image-viewer-placeholder">
              <img
                src={`/api/images/${encodeURIComponent(selectedImagePath)}`}
                alt={selectedEntry?.name}
                className="image-viewer-image"
              />
            </div>
          ) : (
            <div className="image-viewer-empty" role="status">
              No image selected
            </div>
          )}
        </Column>
        <ResizeHandle index={1} width={widths[1]} onStartDrag={startDrag} />
        <Column
          title="Log Viewer"
          flexBasis="auto"
          style={{
            flex: 1,
            minWidth: colMinWidths[2],
          }}
        >
          {selectedEntry && isImageFile(selectedEntry) && (
            <div className="log-viewer-placeholder">
              <p>Log for: {selectedEntry.name}</p>
              <p className="log-viewer-note">(Task 5: connect to log API)</p>
            </div>
          )}
        </Column>
      </div>
    </div>
  );
}

export default Layout;
