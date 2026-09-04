import { decodeEventLog, toEventSelector, type Hex } from "viem";
import type { AttestationCreationEvent, ReceiptLog } from "@agentscan/core";

/**
 * `BondingV5.PreLaunched` - the Virtuals agent-creation event, and the ONLY one a creator proof may
 * be built from.
 *
 * `PreLaunched(token, pair, virtualId, initialPurchase, launchParams)` carries NO creator field
 * (`BondingV5.sol:137-151`), which is why `creatorAddress` is null here and why the Virtuals proof
 * mode is `creator_transaction` rather than `creation_event`: the decoder cannot name a creator, so
 * it does not pretend to.
 *
 * ITS SIBLING `Launched` IS NOT A CREATOR PROOF AND IS DELIBERATELY NOT DECODED. `launch()` is
 * executed by the protocol's KEEPER, in the keeper's own transaction, seconds after the creator's
 * `preLaunch`. Measured on Base on 2026-09-04: `preLaunch` by creator
 * 0x33ef6673..., `Launched` in tx 0x9eca4cb5...f720f99 sent by keeper 0x81f7ca6a.... A verifier
 * that accepted `Launched` would attribute every Virtuals agent to the keeper.
 *
 * `launchParams` is a struct, so the non-indexed tail is the ABI-encoded tuple; the decode is
 * complete rather than partial because a partial decode of a struct tail is how a look-alike event
 * gets read as the real one.
 */
const PRELAUNCHED_EVENT_ABI = [
  {
    type: "event",
    name: "PreLaunched",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "pair", type: "address", indexed: true },
      { name: "virtualId", type: "uint256", indexed: false },
      { name: "initialPurchase", type: "uint256", indexed: false },
      {
        name: "launchParams",
        type: "tuple",
        indexed: false,
        components: [
          { name: "launchMode", type: "uint8" },
          { name: "airdropBips", type: "uint16" },
          { name: "needAcf", type: "bool" },
          { name: "antiSniperTaxType", type: "uint8" },
          { name: "isProject60days", type: "bool" },
        ],
      },
    ],
  },
] as const;

const PRELAUNCHED_TOPIC = toEventSelector("PreLaunched(address,address,uint256,uint256,(uint8,uint16,bool,uint8,bool))");

export function decodeVirtualsPreLaunchedEvents(logs: readonly ReceiptLog[]): AttestationCreationEvent[] {
  const events: AttestationCreationEvent[] = [];
  for (const log of logs) {
    if (log.topics[0] !== PRELAUNCHED_TOPIC) continue;
    try {
      const decoded = decodeEventLog({
        abi: PRELAUNCHED_EVENT_ABI,
        eventName: "PreLaunched",
        topics: log.topics as [Hex, ...Hex[]],
        data: log.data as Hex,
      });
      events.push({
        emitterAddress: log.address.toLowerCase(),
        tokenAddress: decoded.args.token.toLowerCase(),
        creatorAddress: null,
      });
    } catch {
      continue;
    }
  }
  return events;
}
