import "./Column.css";

/**
 * Wrapper for one of the three panes. The visible header text was removed, so
 * `label` names the pane for assistive technology instead.
 */
export function Column({ label, children, flexBasis, style }) {
  return (
    <div
      className="column"
      role="region"
      aria-label={label}
      style={{ flexBasis, minWidth: 200, ...style }}
    >
      <div className="column-content">{children}</div>
    </div>
  );
}

export default Column;
