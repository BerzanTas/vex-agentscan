export function EmptyPanel({
  message,
  withLiveDot = true,
}: {
  message: string;
  withLiveDot?: boolean;
}) {
  return (
    <div className="empty-panel">
      {withLiveDot && <span className="empty-panel-dot" aria-hidden="true" />}
      {message}
    </div>
  );
}
