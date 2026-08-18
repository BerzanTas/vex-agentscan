const CHAIN_ICON_SRC: Record<string, string> = {
  base: "/chains/base.svg",
  arbitrum: "/chains/arbitrum.svg",
  ethereum: "/chains/ethereum.svg",
  optimism: "/chains/optimism.svg",
  polygon: "/chains/polygon.svg",
  robinhood: "/chains/robinhood.svg",
  solana: "/chains/solana.svg",
  bsc: "/chains/bsc.png",
  unichain: "/chains/unichain.png",
  monad: "/chains/monad.png",
  avalanche: "/chains/avalanche.png",
  linea: "/chains/linea.png",
  mantle: "/chains/mantle.png",
  berachain: "/chains/berachain.png",
  hyperevm: "/chains/hyperevm.png",
  sonic: "/chains/sonic.png",
  plasma: "/chains/plasma.png",
  ronin: "/chains/ronin.png",
  megaeth: "/chains/megaeth.png",
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
