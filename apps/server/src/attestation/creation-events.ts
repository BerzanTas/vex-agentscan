import type { AttestationCreationEvent, AttestationLaunchpad, ReceiptLog } from "@agentscan/core";
import { decodePoolsGatewayLaunchEvents } from "./pools-gateway-launch-event.js";
import { decodeTokenCreationEvents } from "./trench-creation-event.js";
import { decodeVirtualsPreLaunchedEvents } from "./virtuals-prelaunch-event.js";

type Decoder = (logs: readonly ReceiptLog[]) => AttestationCreationEvent[];

/**
 * ONE launchpad, ONE decoder. The dispatch is exhaustive on the launchpad the CLAIM names, never a
 * "try each and take whatever matched": running every decoder over every receipt would turn the
 * attestation into "find any allowlisted contract on any launchpad that emitted a matching event",
 * which is weaker than what the signature asserts and weaker than what the allowlist is for.
 */
const DECODERS: Readonly<Record<AttestationLaunchpad, Decoder>> = {
  trench: decodeTokenCreationEvents,
  pools_fun: decodePoolsGatewayLaunchEvents,
  virtuals: decodeVirtualsPreLaunchedEvents,
};

export function decodeCreationEvents(
  launchpad: AttestationLaunchpad,
  logs: readonly ReceiptLog[],
): AttestationCreationEvent[] {
  return DECODERS[launchpad](logs);
}
