import { decodeEventLog, toEventSelector, type Hex } from "viem";
import type { AttestationCreationEvent, ReceiptLog } from "@agentscan/core";

const TOKEN_CREATED_EVENT_ABI = [
  {
    type: "event",
    name: "TokenCreated",
    inputs: [
      { name: "token", type: "address", indexed: false },
      { name: "creator", type: "address", indexed: false },
      { name: "strategy", type: "uint8", indexed: false },
      { name: "dex", type: "uint8", indexed: false },
      { name: "data", type: "bytes", indexed: false },
      { name: "price", type: "uint256", indexed: false },
    ],
  },
] as const;

const TOKEN_CREATED_TOPIC = toEventSelector("TokenCreated(address,address,uint8,uint8,bytes,uint256)");

export function decodeTokenCreationEvents(logs: readonly ReceiptLog[]): AttestationCreationEvent[] {
  const events: AttestationCreationEvent[] = [];
  for (const log of logs) {
    const decoded = decodedTokenCreatedArgs(log);
    if (decoded === null) continue;
    events.push({
      emitterAddress: log.address.toLowerCase(),
      tokenAddress: decoded.token.toLowerCase(),
      creatorAddress: decoded.creator.toLowerCase(),
    });
  }
  return events;
}

function decodedTokenCreatedArgs(log: ReceiptLog): { token: string; creator: string } | null {
  if (log.topics[0] !== TOKEN_CREATED_TOPIC) return null;
  try {
    const decoded = decodeEventLog({
      abi: TOKEN_CREATED_EVENT_ABI,
      eventName: "TokenCreated",
      topics: log.topics as [Hex, ...Hex[]],
      data: log.data as Hex,
    });
    return { token: decoded.args.token, creator: decoded.args.creator };
  } catch {
    return null;
  }
}
