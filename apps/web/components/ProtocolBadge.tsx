const PROTOCOL_ICON_SRC: Record<string, string> = {
  kyberswap: "/protocols/kyberswap.svg",
  uniswap: "/protocols/uniswap.png",
  khalani: "/protocols/khalani.svg",
};

export function ProtocolBadge({ protocol }: { protocol: string }) {
  const iconSrc = PROTOCOL_ICON_SRC[protocol];
  if (iconSrc === undefined) {
    return <span className="rounded bg-bg-overlay px-2 py-0.5 text-xs text-accent">{protocol}</span>;
  }
  return <img src={iconSrc} alt={protocol} title={protocol} className="h-4 w-4 object-contain" />;
}
