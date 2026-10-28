import { useCallback, useEffect, useRef, useState } from "react";
import { useColumnResize } from "../../hooks/useColumnResize";
import { TopBar } from "../TopBar/TopBar";
import { Column } from "../Column/Column";
import { ResizeHandle } from "../ResizeHandle/ResizeHandle";
import { FileBrowser } from "../FileBrowser/FileBrowser";
import "./Layout.css";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);

function isImageFile(entry) {
  return entry.type === "file" && IMAGE_EXTENSIONS.has(entry.ext);
}

function getLastFolder() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("dist-browser-last-folder") || "";
}

export function Layout() {
  const { widths, startDrag } = useColumnResize(3);

  const [currentPath, setCurrentPath] = useState(() => getLastFolder());
  const [entries, setEntries] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedImagePath, setSelectedImagePath] = useState(null);

  const abortRef = useRef(null);

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
          throw new Error(data?.error || `HTTP ${response.status}`);
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
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message || "Failed to load directory");
          // Fall back to root when the restored folder no longer exists (404)
          if (err.message?.includes("404")) {
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
    setCurrentPath(path || "");
  }, []);

  const handleSelect = useCallback(
    (entry) => {
      if (!entry || entry.name === "..") {
        setSelectedEntry(null);
        setSelectedImagePath(null);
        return;
      }

      setSelectedEntry(entry);
      setSelectedIndex(entries.findIndex((e) => e.name === entry.name));

      // Auto-select images: load image in center column + log in right
      if (isImageFile(entry)) {
        const imagePath = currentPath
          ? `${currentPath}/${entry.name}`
          : entry.name;
        setSelectedImagePath(imagePath);
      }
    },
    [currentPath, entries],
  );

  const handleDelete = useCallback(
    async (entry) => {
      if (!entry || entry.name === "..") return;

      const itemPath = currentPath
        ? `${currentPath}/${entry.name}`
        : entry.name;

      try {
        const response = await fetch("/api/trash", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ paths: [itemPath] }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          setError(data?.error || `HTTP ${response.status}`);
          return;
        }

        // Refresh the listing on success
        await fetchDirectory(currentPath);
      } catch {
        setError("Failed to move item to trash");
      }
    },
    [currentPath, fetchDirectory],
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
            selectedEntry={selectedEntry}
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
          {selectedImagePath && (
            <div className="image-viewer-placeholder">
              <img
                src={`/api/images/${encodeURIComponent(selectedImagePath)}`}
                alt={selectedEntry?.name}
                className="image-viewer-image"
              />
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
