import type { ChainEntry, ChainReader } from "@agentscan/core";
import type { Config } from "../config.js";
import type { ChainReaderContext } from "../worker/verify-job.js";
import { confirmAllReaderFor } from "./confirm-all-reader.js";
import { makeSolanaChainReader } from "./solana-chain-reader.js";
import { makeChainReader } from "./viem-chain-reader.js";

export function selectChainReader(entry: ChainEntry, config: Config, context: ChainReaderContext): ChainReader {
  if (config.VERIFY_FAKE_MODE === "confirm_all") return confirmAllReaderFor(context);
  if (entry.chainFamily === "solana") return makeSolanaChainReader(entry, config);
  return makeChainReader(entry, config);
}
