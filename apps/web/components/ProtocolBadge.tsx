const PROTOCOL_ICON_SRC: Record<string, string> = {
  kyberswap: "/protocols/kyberswap.svg",
  uniswap: "/protocols/uniswap.svg",
  khalani: "/protocols/khalani.svg",
  relay: "/protocols/relay.jpg",
};

export function ProtocolBadge({
  protocol,
  withName = false,
}: {
  protocol: string;
  withName?: boolean;
}) {
  const iconSrc = PROTOCOL_ICON_SRC[protocol];
  if (iconSrc === undefined) {
    return <span className="rounded bg-bg-overlay px-2 py-0.5 text-xs text-accent">{protocol}</span>;
  }
  const icon = (
    <img src={iconSrc} alt={protocol} title={protocol} className="h-4 w-4 rounded-sm object-contain" />
  );
  if (!withName) return icon;
  return (
    <span className="protocol-badge">
      {icon}
      <span className="protocol-name">{protocol}</span>
    </span>
  );
}
