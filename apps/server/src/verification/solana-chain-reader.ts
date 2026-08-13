import { z } from "zod";
import type { ChainEntry, ChainReader, ReceiptView } from "@agentscan/core";
import type { Config } from "../config.js";
import { rpcUrlsFor } from "./rpc-urls.js";

export class SolanaTransactionReadError extends Error {
  constructor(reason: string, options?: { cause: unknown }) {
    super(`solana transaction read failed: ${reason}`, options);
    this.name = "SolanaTransactionReadError";
  }
}

const transactionErrorSchema = z.union([z.null(), z.string(), z.record(z.string(), z.unknown())]);
const transactionMetaSchema = z.object({ err: transactionErrorSchema });
const finalizedTransactionSchema = z.object({
  blockTime: z.number().nullable().optional(),
  meta: transactionMetaSchema.nullable(),
});
const resultEnvelopeSchema = z.object({ result: finalizedTransactionSchema.nullable() });
const errorEnvelopeSchema = z.object({ error: z.object({ code: z.number(), message: z.string() }) });

type FinalizedTransaction = z.infer<typeof finalizedTransactionSchema>;

export function makeSolanaChainReader(entry: ChainEntry, config: Config): ChainReader {
  const rpcUrls = rpcUrlsFor(entry, config);
  return {
    getReceipt: (txHash) => readWithFallback(rpcUrls, txHash, config),
  };
}

async function readWithFallback(
  rpcUrls: string[],
  signature: string,
  config: Config,
): Promise<ReceiptView | null> {
  let lastFailure = new SolanaTransactionReadError("no rpc url available");
  for (const url of rpcUrls) {
    try {
      return await readTransaction(url, signature, config);
    } catch (error) {
      lastFailure = asReadError(error);
    }
  }
  throw lastFailure;
}

function asReadError(error: unknown): SolanaTransactionReadError {
  if (error instanceof SolanaTransactionReadError) return error;
  return new SolanaTransactionReadError("request failed", { cause: error });
}

async function readTransaction(url: string, signature: string, config: Config): Promise<ReceiptView | null> {
  const body = await postGetTransaction(url, signature, config);
  const rpcError = errorEnvelopeSchema.safeParse(body);
  if (rpcError.success) {
    throw new SolanaTransactionReadError(
      `rpc error ${rpcError.data.error.code}: ${rpcError.data.error.message}`,
    );
  }
  const envelope = resultEnvelopeSchema.safeParse(body);
  if (!envelope.success) throw new SolanaTransactionReadError("unexpected response body");
  if (envelope.data.result === null) return null;
  return receiptViewOf(envelope.data.result);
}

function receiptViewOf(transaction: FinalizedTransaction): ReceiptView {
  if (transaction.meta === null) throw new SolanaTransactionReadError("transaction meta missing");
  if (transaction.blockTime === null || transaction.blockTime === undefined) {
    throw new SolanaTransactionReadError("block time missing");
  }
  return {
    status: transaction.meta.err === null ? "success" : "reverted",
    blockTimestamp: new Date(transaction.blockTime * 1000),
    erc20Transfers: [],
    transactionValueRaw: null,
  };
}

async function postGetTransaction(url: string, signature: string, config: Config): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(getTransactionRequest(signature)),
    signal: AbortSignal.timeout(config.SOLANA_RPC_TIMEOUT_MS),
  });
  if (!response.ok) throw new SolanaTransactionReadError(`status ${response.status}`);
  return await response.json();
}

function getTransactionRequest(signature: string): unknown {
  return {
    jsonrpc: "2.0",
    id: 1,
    method: "getTransaction",
    params: [signature, { commitment: "finalized", maxSupportedTransactionVersion: 0, encoding: "json" }],
  };
}
