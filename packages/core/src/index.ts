export {
  evmChains,
  solanaChains,
  type ChainEntry,
  type EvmChain,
  type SolanaChain,
} from "./chain-registry/chains.js";
export { resolveChain, type ChainKey, type ResolveChain } from "./chain-registry/registry.js";
export type { ChainReader, ReceiptLog, ReceiptView } from "./verification/chain-reader.js";
export { evaluateVerification, type Verdict, type VerificationInput } from "./verification/evaluate.js";
export {
  evaluateAttestationVerification,
  type AttestationCreationEvent,
  type AttestationMismatchDetail,
  type AttestationReceiptView,
  type AttestationVerdict,
  type AttestationVerificationInput,
} from "./verification/evaluate-attestation.js";
export {
  isLaunchShaped,
  resolveVerificationTier,
  type VerificationKind,
} from "./verification/verification-policy.js";
export {
  decideIngest,
  type ExistingActivityState,
  type IngestDecision,
  type IngestEventStatus,
  type IngestOutcome,
} from "./ingest-decision.js";
export { backoffDelayMs, nextBackoff } from "./backoff.js";
export { generatePublicId } from "./public-id.js";
export type { PriceFeed, PricePoint, PriceQuery } from "./pricing/price-feed.js";
export { resolveCoinKey, type CoinKeyQuery, type CoinKeyResolution } from "./pricing/coin-key.js";
export { isPriceAcceptable, type PriceAcceptanceGate } from "./pricing/acceptance.js";
export { isPositiveDecimalText, legUsd, plainDecimalFrom } from "./pricing/decimal.js";
export {
  decidePricingOutcome,
  presentLeg,
  priceDivergenceRatio,
  pricingRetryOutcome,
  type ActivityLeg,
  type LegPricing,
  type PricingOutcome,
  type PricingRetryBudget,
} from "./pricing/pricing-decision.js";
export {
  rangeWindowSeconds,
  resolveChartRange,
  type ChartRange,
  type ChartRangePlan,
} from "./chart-range.js";
export { resolveBridgeChain } from "./bridge-chain.js";
export {
  chainCatalog,
  chainKeysForSlug,
  type CatalogChain,
  type ChainFamily,
  type ChainKeyForSlug,
} from "./chain-registry/catalog.js";
export {
  ATTESTATION_CHAIN_IDS,
  buildAttestationChainRegistry,
  type AttestationChainEntry,
  type AttestationChainRegistry,
} from "./chain-registry/attestation-chain-registry.js";
export type {
  AgentActivity,
  AgentActivityLeg,
  PricingState,
} from "./agent-metrics/agent-activity.js";
export {
  capitalDeployed,
  type CapitalDeployed,
  type DailyDeployed,
} from "./agent-metrics/capital-deployed.js";
export { realizedResult, winRate, type RealizedResult } from "./agent-metrics/realized-result.js";
export {
  chainBreakdown,
  protocolBreakdown,
  type ChainVolume,
  type ProtocolVolume,
} from "./agent-metrics/breakdowns.js";
export { activitiesPerDay30d } from "./agent-metrics/activity-cadence.js";
export { unpriced30dSharePct, unpricedSharePct } from "./agent-metrics/unpriced-share.js";
export { publishedUsd } from "./agent-metrics/published-usd.js";
export {
  attestationSignalsFor,
  bestAttestationCandidate,
  displayStatusOf,
  type AttestationCandidate,
  type AttestationDisplayStatus,
  type AttestationSignal,
  type AttestationVerifyStatus,
} from "./attestation-precedence.js";
