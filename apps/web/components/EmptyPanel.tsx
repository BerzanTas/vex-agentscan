export function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="empty-panel">
      <span className="empty-panel-dot" aria-hidden="true" />
      {message}
    </div>
  );
}
