import { useCallback, useEffect, useRef, useState } from "react";
import "./FileBrowser.css";

const LAST_FOLDER_KEY = "dist-browser-last-folder";
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);

const FolderIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const ImageIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

function isImageFile(entry) {
  return entry.type === "file" && IMAGE_EXTENSIONS.has(entry.ext);
}

export function FileBrowser({
  currentPath,
  entries,
  selectedIndex,
  loading,
  error,
  onNavigate,
  onSelect,
  onDelete,
  onRefresh,
}) {
  const listRef = useRef(null);
  const parentButtonRef = useRef(null);
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const isKeyboardNavigatingRef = useRef(false);

  // Hovered index for mouse hover tracking
  const [hoveredIndex, setHoveredIndex] = useState(null);

  // Track last currentPath to detect navigation
  const lastPathRef = useRef(currentPath);

  // Extract parent folder path (DRY helper)
  function getParentPath(path) {
    if (!path) return "";
    return path.split("/").slice(0, -1).join("/");
  }

  // Scroll selected item into view when it changes
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const selectedNode = listRef.current.querySelector(
        `[data-index="${selectedIndex}"]`,
      );
      if (selectedNode) {
        selectedNode.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  // Persist last folder on navigation
  useEffect(() => {
    if (currentPath) {
      localStorage.setItem(LAST_FOLDER_KEY, currentPath);
    }
  }, [currentPath]);

  // Auto-focus list after navigating to a new folder
  useEffect(() => {
    if (lastPathRef.current !== currentPath) {
      lastPathRef.current = currentPath;
      // Brief delay to allow DOM to update after re-render
      const timer = setTimeout(() => {
        if (listRef.current) {
          listRef.current.focus();
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [currentPath]);

  // Focus the ".." button when the list receives keyboard focus
  const handleListFocus = useCallback(() => {
    isKeyboardNavigatingRef.current = true;
    if (currentPath && parentButtonRef.current) {
      parentButtonRef.current.focus();
    }
  }, [currentPath]);

  // Focus the ".." button programmatically
  const focusParentButton = useCallback(() => {
    if (parentButtonRef.current) {
      parentButtonRef.current.focus();
    }
  }, []);

  // Clear mouse hover when keyboard interaction starts
  const clearHover = useCallback(() => {
    setHoveredIndex(null);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e) => {
      if (loadingRef.current) return;

      const listLength = entries.length;
      if (listLength === 0) return;

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          isKeyboardNavigatingRef.current = true;
          clearHover();
          const next = (selectedIndex + 1) % listLength;
          // Notify parent of new selection
          onSelect?.(entries[next] || null);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          isKeyboardNavigatingRef.current = true;
          clearHover();
          const prev = (selectedIndex - 1 + listLength) % listLength;
          onSelect?.(entries[prev] || null);
          break;
        }
        case "Enter": {
          e.preventDefault();
          const entry = entries[selectedIndex];
          if (!entry) return;
          // If parent (".."), navigate up
          if (entry.name === "..") {
            onNavigate?.(getParentPath(currentPath));
            return;
          }
          // If folder, navigate into it
          if (entry.type === "folder") {
            const newPath = currentPath
              ? `${currentPath}/${entry.name}`
              : entry.name;
            onNavigate?.(newPath);
          }
          // Images: already selected via onSelect, no double action
          break;
        }
        case "Backspace": {
          e.preventDefault();
          onNavigate?.(getParentPath(currentPath));
          break;
        }
        case "Delete": {
          e.preventDefault();
          const entry = entries[selectedIndex];
          if (entry && entry.name !== "..") {
            onDelete?.(entry);
          }
          break;
        }
        case "Home": {
          e.preventDefault();
          if (currentPath && entries.length > 0) {
            isKeyboardNavigatingRef.current = true;
            clearHover();
            onSelect?.(entries[0] || null);
            focusParentButton();
          }
          break;
        }
        default:
          break;
      }
    },
    [
      selectedIndex,
      entries,
      currentPath,
      onNavigate,
      onSelect,
      onDelete,
      clearHover,
      focusParentButton,
    ],
  );

  // Handle single click: select item (no folder-up on single-click)
  const handleClick = useCallback(
    (index) => {
      if (loadingRef.current) return;
      const entry = entries[index];
      if (!entry) return;

      // Single-click on ".." does nothing — use double-click or Enter instead
      if (entry.name === "..") {
        return;
      }

      onSelect?.(entry);
    },
    [entries, onSelect],
  );

  // Handle double click: open folder
  const handleDoubleClick = useCallback(
    (index) => {
      if (loadingRef.current) return;
      const entry = entries[index];
      if (!entry) return;

      if (entry.name === "..") {
        onNavigate?.(getParentPath(currentPath));
        return;
      }

      if (entry.type === "folder") {
        const newPath = currentPath
          ? `${currentPath}/${entry.name}`
          : entry.name;
        onNavigate?.(newPath);
      }
      // Images: no action on double-click
    },
    [entries, currentPath, onNavigate],
  );

  const handleRefresh = useCallback(() => {
    onRefresh?.();
  }, [onRefresh]);

  // Render
  return (
    <div className="file-browser" role="tree" aria-label="File browser">
      {/* Loading state */}
      {loading && (
        <div className="file-browser-loading" aria-busy="true">
          Loading…
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="file-browser-error" role="alert">
          {error}
        </div>
      )}

      {/* Entry list */}
      <div
        ref={listRef}
        className="file-browser-list"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onFocus={handleListFocus}
        onMouseDown={() => {
          isKeyboardNavigatingRef.current = false;
        }}
        onTouchStart={() => {
          isKeyboardNavigatingRef.current = false;
        }}
      >
        {entries.length === 0 && !loading ? (
          <div className="file-browser-empty">This folder is empty.</div>
        ) : (
          entries.map((entry, index) => {
            const isSelected = index === selectedIndex;
            const isParent = entry.name === "..";
            const isFolder = entry.type === "folder";
            const isImage = isImageFile(entry);

            return (
              <div
                key={entry.name}
                data-index={index}
                className={`file-browser-item${
                  isSelected ? " file-browser-item--selected" : ""
                }${hoveredIndex === index ? " file-browser-item--hovered" : ""}`}
                role="treeitem"
                aria-selected={isSelected}
                aria-label={isParent ? "Parent folder" : entry.name}
                tabIndex={-1}
                onClick={() => handleClick(index)}
                onDoubleClick={() => handleDoubleClick(index)}
                onMouseEnter={() => {
                  isKeyboardNavigatingRef.current = false;
                  setHoveredIndex(index);
                }}
                onMouseLeave={() => {
                  setHoveredIndex(null);
                }}
              >
                {/* Icon column */}
                <span className="file-browser-icon">
                  {isParent ? (
                    <button
                      ref={parentButtonRef}
                      type="button"
                      className="file-browser-icon-parent"
                      tabIndex={0}
                      aria-label="Go to parent folder"
                    >
                      ↑
                    </button>
                  ) : isFolder ? (
                    <FolderIcon />
                  ) : isImage ? (
                    <ImageIcon />
                  ) : null}
                </span>

                {/* Name column */}
                <span
                  className={`file-browser-name${
                    isParent ? " file-browser-name--parent" : ""
                  }`}
                >
                  {entry.name}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Footer: refresh hint */}
      <div className="file-browser-footer">
        <button
          className="file-browser-refresh"
          onClick={handleRefresh}
          aria-label="Refresh folder"
          title="Refresh"
        >
          ↻ Refresh
        </button>
      </div>
    </div>
  );
}

export default FileBrowser;
