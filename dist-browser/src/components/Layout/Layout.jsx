import { useCallback, useState } from "react";
import { useColumnResize } from "../../hooks/useColumnResize";
import { useFileBrowserState } from "../../hooks/useFileBrowserState";
import { useFolderPath } from "../../hooks/useFolderPath";
import { useImageLog } from "../../hooks/useImageLog";
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

  // The log for the selected image is fetched per selection, in parallel with
  // the image file request made by the Image Viewer. The lookup is keyed on the
  // selected image path, which the endpoint normalises to the bare filename.
  const [refreshKey, setRefreshKey] = useState(0);
  const log = useImageLog(browser.selectedImagePath, refreshKey);

  // Handle refresh: re-fetch the directory listing and re-look-up the log for
  // the image that is still selected, in the same event so React batches them.
  const handleRefresh = useCallback(() => {
    browser.refresh();
    setRefreshKey((key) => key + 1);
  }, [browser]);

  return (
    <div className="app-layout">
      <TopBar onRefresh={handleRefresh} currentPath={currentPath} />
      <div className="columns-container">
        <Column
          label="File Browser"
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
          />
        </Column>
        <ResizeHandle index={0} width={widths[0]} onStartDrag={startDrag} />
        <Column
          label="Image Viewer"
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
          label="Log Viewer"
          flexBasis="auto"
          style={{
            flex: 1,
            minWidth: minWidths[2],
          }}
        >
          <LogViewer log={log} />
        </Column>
      </div>
    </div>
  );
}

export default Layout;
