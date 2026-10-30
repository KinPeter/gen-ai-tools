import { useRef } from "react";
import { useFileBrowserFocus } from "../../hooks/useFileBrowserFocus";
import { useFileBrowserHover } from "../../hooks/useFileBrowserHover";
import { useFileBrowserKeyboard } from "../../hooks/useFileBrowserKeyboard";
import { useSelectedEntryScroll } from "../../hooks/useSelectedEntryScroll";
import { FileBrowserEntry } from "./FileBrowserEntry";
import "./FileBrowser.css";

/**
 * Presentational shell of the file browser: loading/error banners, the scrollable
 * list of entries, and the refresh footer. The interaction details live in the
 * hooks below and in `FileBrowserEntry`; the row itself is a component of its own.
 */
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

  const { hoveredIndex, setHoveredIndex } = useFileBrowserHover(entries);

  // The selected row is scrolled into view whenever the selection moves.
  useSelectedEntryScroll(listRef, selectedIndex);

  const { handleListFocus, focusParentButton } = useFileBrowserFocus(
    listRef,
    parentButtonRef,
    currentPath,
  );

  const handleKeyDown = useFileBrowserKeyboard({
    entries,
    selectedIndex,
    currentPath,
    loading,
    setHoveredIndex,
    focusParentButton,
    onNavigate,
    onSelect,
    onDelete,
  });

  return (
    <div className="file-browser" role="tree" aria-label="File browser">
      {loading && (
        <div className="file-browser-loading" aria-busy="true">
          Loading…
        </div>
      )}

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
      >
        {entries.length === 0 && !loading ? (
          <div className="file-browser-empty">This folder is empty.</div>
        ) : (
          entries.map((entry, index) => (
            <FileBrowserEntry
              key={entry.name}
              entry={entry}
              index={index}
              isSelected={index === selectedIndex}
              isHovered={hoveredIndex === index}
              currentPath={currentPath}
              loading={loading}
              parentButtonRef={parentButtonRef}
              setHoveredIndex={setHoveredIndex}
              onNavigate={onNavigate}
              onSelect={onSelect}
            />
          ))
        )}
      </div>

      {/* Footer: refresh hint */}
      <div className="file-browser-footer">
        <button
          className="file-browser-refresh"
          onClick={() => onRefresh?.()}
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
