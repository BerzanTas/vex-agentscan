const CHAIN_ICON_SRC: Record<string, string> = {
  base: "/chains/base.svg",
  arbitrum: "/chains/arbitrum.svg",
  ethereum: "/chains/ethereum.svg",
  optimism: "/chains/optimism.svg",
  polygon: "/chains/polygon.svg",
  solana: "/chains/solana.svg",
};

export function ChainBadge({ slug }: { slug: string }) {
  const iconSrc = CHAIN_ICON_SRC[slug];
  return (
    <span className="inline-flex items-center gap-1.5">
      {iconSrc !== undefined && <img src={iconSrc} alt="" className="h-3.5 w-3.5" />}
      {slug}
    </span>
  );
}
