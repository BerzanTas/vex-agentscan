import { decodeEventLog, toEventSelector, type Hex } from "viem";
import type { AttestationCreationEvent, ReceiptLog } from "@agentscan/core";

/**
 * `PoolsFunLaunchGateway.GatewayLaunch` - the pools.fun launch event that names the HUMAN.
 *
 * The suite's other launch event, `PartyFactory.TokenLaunched`, names the GATEWAY as `creator` on
 * every gateway launch, so attributing an attestation from it would credit the gateway contract for
 * every token pools.fun has ever launched. `GatewayLaunch.launcher` is the wallet that sent the
 * launch, which is what the attest signature claims to be.
 *
 * Topics are byte-identical across the V1, V2 and V3 suites (probe REPORT.md section 10, measured
 * 2026-09-04), so one decoder serves all three; the suites differ only in emitter address, which is
 * what the registry's allowlist carries.
 */
const GATEWAY_LAUNCH_EVENT_ABI = [
  {
    type: "event",
    name: "GatewayLaunch",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "pool", type: "address", indexed: true },
      { name: "launcher", type: "address", indexed: true },
      { name: "pairedAsset", type: "address", indexed: false },
      { name: "feeRecipient", type: "address", indexed: false },
      { name: "userSalt", type: "bytes32", indexed: false },
      { name: "feePaidWei", type: "uint256", indexed: false },
      { name: "devBuyOut", type: "uint256", indexed: false },
    ],
  },
] as const;

const GATEWAY_LAUNCH_TOPIC = toEventSelector(
  "GatewayLaunch(address,address,address,address,address,bytes32,uint256,uint256)",
);

export function decodePoolsGatewayLaunchEvents(logs: readonly ReceiptLog[]): AttestationCreationEvent[] {
  const events: AttestationCreationEvent[] = [];
  for (const log of logs) {
    if (log.topics[0] !== GATEWAY_LAUNCH_TOPIC) continue;
    try {
      const decoded = decodeEventLog({
        abi: GATEWAY_LAUNCH_EVENT_ABI,
        eventName: "GatewayLaunch",
        topics: log.topics as [Hex, ...Hex[]],
        data: log.data as Hex,
      });
      events.push({
        emitterAddress: log.address.toLowerCase(),
        tokenAddress: decoded.args.token.toLowerCase(),
        creatorAddress: decoded.args.launcher.toLowerCase(),
      });
    } catch {
      continue;
    }
  }
  return events;
}
