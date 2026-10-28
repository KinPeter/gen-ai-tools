import { useColumnResize } from "../../hooks/useColumnResize";
import { TopBar } from "../TopBar/TopBar";
import { Column } from "../Column/Column";
import { ResizeHandle } from "../ResizeHandle/ResizeHandle";
import "./Layout.css";

function noop() {
  console.log("Refresh — not wired yet");
}

export function Layout() {
  const { widths, startDrag } = useColumnResize(3);

  const colMinWidths = [200, 300, 300];

  return (
    <div className="app-layout">
      <TopBar onRefresh={noop} />
      <div className="columns-container">
        <Column
          title="File Browser"
          flexBasis={widths[0]}
          style={{ minWidth: colMinWidths[0] }}
        />
        <ResizeHandle index={0} width={widths[0]} onStartDrag={startDrag} />
        <Column
          title="Image Viewer"
          flexBasis={widths[1]}
          style={{ minWidth: colMinWidths[1] }}
        />
        <ResizeHandle index={1} width={widths[1]} onStartDrag={startDrag} />
        <Column
          title="Log Viewer"
          flexBasis="auto"
          style={{
            flex: 1,
            minWidth: colMinWidths[2],
          }}
        />
      </div>
    </div>
  );
}

export default Layout;
