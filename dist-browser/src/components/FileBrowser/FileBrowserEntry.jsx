import { isImageFile } from "../../utils/is-image";
import {
  isFolderEntry,
  isParentEntry,
  joinFolderPath,
} from "../../utils/entries";
import { parentFolderPath } from "../../utils/last-folder";
import { FolderIcon, ImageIcon } from "./FileBrowserIcons";
import "./FileBrowserEntry.css";

/**
 * One row of the file browser list: icon, name, and the click semantics that
 * belong to it.
 *
 * - Single click selects an entry; the ".." row ignores it (use Enter or a
 *   double click to go up).
 * - Double click opens a folder or the ".." row; images do nothing.
 * - Hovering marks the row; the highlight itself is owned by
 *   `useFileBrowserHover` in the parent.
 */
export function FileBrowserEntry({
  entry,
  index,
  isSelected,
  isHovered,
  currentPath,
  loading,
  setHoveredIndex,
  onNavigate,
  onSelect,
}) {
  const isParent = isParentEntry(entry);
  const isFolder = isFolderEntry(entry);

  const navigateToParent = () => onNavigate?.(parentFolderPath(currentPath));

  return (
    <div
      data-index={index}
      className={`file-browser-item${
        isSelected ? " file-browser-item--selected" : ""
      }${isHovered ? " file-browser-item--hovered" : ""}`}
      role="treeitem"
      aria-selected={isSelected}
      aria-label={isParent ? "Parent folder" : entry.name}
      tabIndex={-1}
      onClick={() => {
        if (loading || isParent) return;
        onSelect?.(entry);
      }}
      onDoubleClick={() => {
        if (loading) return;
        if (isParent) {
          navigateToParent();
        } else if (isFolder) {
          onNavigate?.(joinFolderPath(currentPath, entry.name));
        }
        // Images: no action on double-click
      }}
      onMouseEnter={() => {
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
            type="button"
            className="file-browser-icon-parent"
            tabIndex={-1}
            aria-label="Go to parent folder"
            onClick={navigateToParent}
          >
            ↑
          </button>
        ) : isFolder ? (
          <FolderIcon />
        ) : isImageFile(entry) ? (
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
}

export default FileBrowserEntry;
