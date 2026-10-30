import { useCallback, useState } from "react";
import { useColumnResize } from "../../hooks/useColumnResize";
import { useFileBrowserState } from "../../hooks/useFileBrowserState";
import { useFolderPath } from "../../hooks/useFolderPath";
import { useLogEntries } from "../../hooks/useLogEntries";
import { TopBar } from "../TopBar/TopBar";
import { Column } from "../Column/Column";
import { ResizeHandle } from "../ResizeHandle/ResizeHandle";
import { FileBrowser } from "../FileBrowser/FileBrowser";
import { ImageViewer } from "../ImageViewer/ImageViewer";
import { LogViewer } from "../LogViewer/LogViewer";
import "./Layout.css";

/**
 * Three-column shell of the dist browser. All of the listing, selection and
 * delete logic lives in hooks; the columns themselves are components, so this
 * file only wires them together.
 */
export function Layout() {
  const { widths, startDrag, minWidths } = useColumnResize(3);
  const { currentPath, navigateTo } = useFolderPath();
  const browser = useFileBrowserState(currentPath, navigateTo);

  // Log entries: fetch on mount, re-fetch when the refresh key changes.
  const [refreshKey, setRefreshKey] = useState(0);
  const logs = useLogEntries(refreshKey);

  // Handle refresh: re-fetch both the directory listing and the log entries
  // in the same event so React batches them into one update.
  const handleRefresh = useCallback(() => {
    browser.refresh();
    setRefreshKey((k) => k + 1);
  }, [browser]);

  return (
    <div className="app-layout">
      <TopBar onRefresh={handleRefresh} currentPath={currentPath} />
      <div className="columns-container">
        <Column
          title="File Browser"
          flexBasis={widths[0]}
          style={{ minWidth: minWidths[0] }}
        >
          <FileBrowser
            currentPath={currentPath}
            entries={browser.entries}
            selectedIndex={browser.selectedIndex}
            loading={browser.loading}
            error={browser.error}
            onNavigate={navigateTo}
            onSelect={browser.selectEntry}
            onDelete={browser.deleteEntry}
            onRefresh={browser.refresh}
          />
        </Column>
        <ResizeHandle index={0} width={widths[0]} onStartDrag={startDrag} />
        <Column
          title="Image Viewer"
          flexBasis={widths[1]}
          style={{ minWidth: minWidths[1] }}
        >
          <ImageViewer
            imagePath={browser.selectedImagePath}
            alt={browser.selectedEntry?.name}
          />
        </Column>
        <ResizeHandle index={1} width={widths[1]} onStartDrag={startDrag} />
        <Column
          title="Log Viewer"
          flexBasis="auto"
          style={{
            flex: 1,
            minWidth: minWidths[2],
          }}
        >
          <LogViewer
            entry={browser.selectedEntry}
            logEntries={logs.entries}
            logsLoading={logs.loading}
          />
        </Column>
      </div>
    </div>
  );
}

export default Layout;
