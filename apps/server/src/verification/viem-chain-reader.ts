import {
  createPublicClient,
  decodeEventLog,
  fallback,
  http,
  parseAbiItem,
  toEventSelector,
  TransactionReceiptNotFoundError,
  type Hash,
  type Log,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import type {
  ChainEntry,
  ChainReader,
  MissingReceiptCorroboration,
  ReceiptView,
} from "@agentscan/core";
import type { Config } from "../config.js";
import { rpcUrlsFor } from "./rpc-urls.js";

async function corroborateMissing(
  clients: PublicClient[],
  txHash: string,
): Promise<MissingReceiptCorroboration> {
  const answers = await Promise.all(
    clients.map(async (client) => {
      try {
        return (await receiptOrNull(client, txHash)) === null ? "absent" : "present";
      } catch {
        return "silent";
      }
    }),
  );
  if (answers.includes("present")) return "found";
  const absent = answers.filter((answer) => answer === "absent").length;
  return absent >= CORROBORATING_ENDPOINTS_NEEDED ? "missing" : "unknown";
}

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const transferTopic = toEventSelector(transferEvent);

const CORROBORATING_ENDPOINTS_NEEDED = 2;

export function makeChainReader(entry: ChainEntry, config: Config): ChainReader {
  const endpoints = rpcUrlsFor(entry, config);
  const client = createPublicClient({ transport: fallback(endpoints.map((url) => http(url))) });
  const singleEndpointClients = endpoints.map((url) => createPublicClient({ transport: http(url) }));
  return {
    async getReceipt(txHash) {
      const receipt = await receiptOrNull(client, txHash);
      if (receipt === null) return null;
      const block = await client.getBlock({ blockHash: receipt.blockHash });
      return {
        status: receipt.status === "success" ? "success" : "reverted",
        blockTimestamp: new Date(Number(block.timestamp) * 1000),
        blockNumber: receipt.blockNumber,
        erc20Transfers: erc20TransfersFrom(receipt.logs),
        transactionValueRaw: await transactionValueOrNull(client, txHash),
        logs: rawLogsFrom(receipt.logs),
      };
    },
    getHeadBlockNumber: () => client.getBlockNumber(),
    corroborateMissingReceipt: (txHash) => corroborateMissing(singleEndpointClients, txHash),
  };
}

async function receiptOrNull(client: PublicClient, txHash: string): Promise<TransactionReceipt | null> {
  try {
    return await client.getTransactionReceipt({ hash: txHash as Hash });
  } catch (error) {
    if (error instanceof TransactionReceiptNotFoundError) return null;
    throw error;
  }
}

async function transactionValueOrNull(client: PublicClient, txHash: string): Promise<string | null> {
  try {
    const transaction = await client.getTransaction({ hash: txHash as Hash });
    return transaction.value.toString();
  } catch {
    return null;
  }
}

function rawLogsFrom(logs: Log[]): NonNullable<ReceiptView["logs"]> {
  return logs.map((log) => ({ address: log.address, topics: [...log.topics], data: log.data }));
}

function erc20TransfersFrom(logs: Log[]): ReceiptView["erc20Transfers"] {
  const transfers: ReceiptView["erc20Transfers"] = [];
  for (const log of logs) {
    if (log.topics[0] !== transferTopic || log.topics.length !== 3) continue;
    const decoded = decodeEventLog({
      abi: [transferEvent],
      eventName: "Transfer",
      data: log.data,
      topics: log.topics,
    });
    transfers.push({
      token: log.address,
      from: decoded.args.from,
      to: decoded.args.to,
      amountRaw: decoded.args.value.toString(),
    });
  }
  return transfers;
}
