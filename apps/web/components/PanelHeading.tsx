export function PanelHeading({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
      <h2 className="text-sm text-text-secondary">{title}</h2>
      {meta !== undefined && (
        <span className="font-mono text-xs tracking-wide text-text-muted">{meta}</span>
      )}
    </div>
  );
}
