const PROTOCOL_ICON_SRC = new Map<string, string>([
  ["dexscreener", "/protocols/dexscreener.jpg"],
  ["jupiter", "/protocols/jupiter.png"],
  ["khalani", "/protocols/khalani.svg"],
  ["kyberswap", "/protocols/kyberswap.svg"],
  ["pendle", "/protocols/pendle.jpg"],
  ["relay", "/protocols/relay.jpg"],
  ["trench", "/protocols/trench.jpg"],
  ["uniswap", "/protocols/uniswap.svg"],
]);

export function ProtocolBadge({
  protocol,
  withName = false,
}: {
  protocol: string;
  withName?: boolean;
}) {
  const iconSrc = PROTOCOL_ICON_SRC.get(protocol);
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
