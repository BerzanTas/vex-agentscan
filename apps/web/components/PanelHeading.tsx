export function PanelHeading({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="panel-heading">
      <h2 className="panel-heading-title">{title}</h2>
      {meta !== undefined && <span className="panel-heading-meta">{meta}</span>}
    </div>
  );
}
