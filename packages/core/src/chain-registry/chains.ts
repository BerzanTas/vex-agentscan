export type ChainEntry = {
  canonicalSlug: string;
  displayName: string;
  explorerTxUrl: (txHash: string) => string | null;
  rpcUrls: string[];
  verificationTier: "full" | "basic";
};

export type EvmChain = { chainId: bigint; entry: ChainEntry };
export type SolanaChain = { protocol: string; chainId: bigint; entry: ChainEntry };

const explorerTx =
  (baseUrl: string) =>
  (txHash: string): string =>
    `${baseUrl}/tx/${txHash}`;

export const evmChains: readonly EvmChain[] = [
  {
    chainId: 1n,
    entry: {
      canonicalSlug: "ethereum",
      displayName: "Ethereum",
      explorerTxUrl: explorerTx("https://etherscan.io"),
      rpcUrls: ["https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com"],
      verificationTier: "full",
    },
  },
  {
    chainId: 8453n,
    entry: {
      canonicalSlug: "base",
      displayName: "Base",
      explorerTxUrl: explorerTx("https://basescan.org"),
      rpcUrls: ["https://mainnet.base.org", "https://base-rpc.publicnode.com"],
      verificationTier: "full",
    },
  },
  {
    chainId: 42161n,
    entry: {
      canonicalSlug: "arbitrum",
      displayName: "Arbitrum One",
      explorerTxUrl: explorerTx("https://arbiscan.io"),
      rpcUrls: ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one-rpc.publicnode.com"],
      verificationTier: "full",
    },
  },
  {
    chainId: 10n,
    entry: {
      canonicalSlug: "optimism",
      displayName: "OP Mainnet",
      explorerTxUrl: explorerTx("https://optimistic.etherscan.io"),
      rpcUrls: ["https://mainnet.optimism.io", "https://optimism-rpc.publicnode.com"],
      verificationTier: "full",
    },
  },
  {
    chainId: 137n,
    entry: {
      canonicalSlug: "polygon",
      displayName: "Polygon",
      explorerTxUrl: explorerTx("https://polygonscan.com"),
      rpcUrls: ["https://polygon-rpc.com", "https://polygon-bor-rpc.publicnode.com"],
      verificationTier: "full",
    },
  },
  {
    chainId: 4663n,
    entry: {
      canonicalSlug: "robinhood",
      displayName: "Robinhood Chain",
      explorerTxUrl: explorerTx("https://robinhoodchain.blockscout.com"),
      rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
      verificationTier: "full",
    },
  },
];

const solanaEntry: ChainEntry = {
  canonicalSlug: "solana",
  displayName: "Solana",
  explorerTxUrl: explorerTx("https://solscan.io"),
  rpcUrls: ["https://api.mainnet-beta.solana.com"],
  verificationTier: "basic",
};

export const solanaChains: readonly SolanaChain[] = [
  { protocol: "khalani", chainId: 20011000000n, entry: solanaEntry },
  { protocol: "relay", chainId: 792703809n, entry: solanaEntry },
];
