import "./Column.css";

export function Column({ title, children, flexBasis, style }) {
  return (
    <div className="column" style={{ flexBasis, minWidth: 200, ...style }}>
      <div className="column-header" role="heading" aria-level="2">
        {title}
      </div>
      <div className="column-content">{children}</div>
    </div>
  );
}

export default Column;
