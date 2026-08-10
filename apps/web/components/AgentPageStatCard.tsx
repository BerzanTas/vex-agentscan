export function AgentPageStatCard({
  label,
  window,
  value,
  exactValue,
  unit,
  note,
}: {
  label: string;
  window?: string;
  value: string;
  exactValue?: string;
  unit?: string;
  note?: string;
}) {
  return (
    <div className="glass stat-card">
      <div className="stat-card-head">
        <span className="stat-card-label">{label}</span>
        {window !== undefined && <span className="stat-card-window">{window}</span>}
      </div>
      <p className="stat-card-value" title={exactValue}>
        {value}
        {unit !== undefined && <span className="stat-card-unit">{unit}</span>}
      </p>
      {note !== undefined && <p className="text-xs text-text-muted">{note}</p>}
    </div>
  );
}
