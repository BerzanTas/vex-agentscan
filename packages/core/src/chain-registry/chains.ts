export type ChainFamily = "eip155" | "solana";

export type ChainEntry = {
  canonicalSlug: string;
  chainFamily: ChainFamily;
  displayName: string;
  explorerTxUrl: (txHash: string) => string | null;
  rpcUrls: string[];
  verificationTier: "full" | "basic";
  priceFeedKey?: string;
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
      chainFamily: "eip155",
      priceFeedKey: "ethereum",
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
      chainFamily: "eip155",
      priceFeedKey: "base",
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
      chainFamily: "eip155",
      priceFeedKey: "arbitrum",
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
      chainFamily: "eip155",
      priceFeedKey: "optimism",
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
      chainFamily: "eip155",
      priceFeedKey: "polygon",
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
      chainFamily: "eip155",
      priceFeedKey: "robinhood",
      displayName: "Robinhood Chain",
      explorerTxUrl: explorerTx("https://robinhoodchain.blockscout.com"),
      rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
      verificationTier: "full",
    },
  },
  {
    chainId: 130n,
    entry: {
      canonicalSlug: "unichain",
      chainFamily: "eip155",
      priceFeedKey: "unichain",
      displayName: "Unichain",
      explorerTxUrl: explorerTx("https://uniscan.xyz"),
      rpcUrls: ["https://mainnet.unichain.org", "https://unichain-rpc.publicnode.com"],
      verificationTier: "full",
    },
  },
  {
    chainId: 143n,
    entry: {
      canonicalSlug: "monad",
      chainFamily: "eip155",
      priceFeedKey: "monad",
      displayName: "Monad",
      explorerTxUrl: explorerTx("https://monadvision.com"),
      rpcUrls: ["https://rpc.monad.xyz", "https://rpc1.monad.xyz"],
      verificationTier: "full",
    },
  },
  {
    chainId: 999n,
    entry: {
      canonicalSlug: "hyperevm",
      chainFamily: "eip155",
      // DefiLlama's coins API serves HyperEVM under "hyperliquid"; "hyperevm" also
      // answers today but is absent from https://coins.llama.fi/chains, so the
      // published slug is the one registered here.
      priceFeedKey: "hyperliquid",
      displayName: "HyperEVM",
      explorerTxUrl: explorerTx("https://hyperevmscan.io"),
      rpcUrls: ["https://rpc.hyperliquid.xyz/evm"],
      verificationTier: "full",
    },
  },
];

const solanaEntry: ChainEntry = {
  canonicalSlug: "solana",
  chainFamily: "solana",
  priceFeedKey: "solana",
  displayName: "Solana",
  explorerTxUrl: explorerTx("https://solscan.io"),
  rpcUrls: ["https://api.mainnet-beta.solana.com"],
  verificationTier: "basic",
};

export const solanaChains: readonly SolanaChain[] = [
  { protocol: "khalani", chainId: 20011000000n, entry: solanaEntry },
  { protocol: "relay", chainId: 792703809n, entry: solanaEntry },
  { protocol: "jupiter", chainId: 20011000000n, entry: solanaEntry },
];
