import type { AttestationJobOutcome } from "../attestation/verify-job.js";
import {
  finalizeAttestation,
  rescheduleAttestation,
  terminalizeUnverifiable,
  type SqlExecutor,
} from "../repos/token-attestations-verify-repo.js";

export async function applyAttestationOutcome(
  client: SqlExecutor,
  id: string,
  outcome: AttestationJobOutcome,
): Promise<void> {
  if (outcome.kind === "reschedule") {
    await rescheduleAttestation(client, id, outcome.delayMs);
    return;
  }
  if (outcome.kind === "terminalize_unverifiable") {
    await terminalizeUnverifiable(client, id);
    return;
  }
  if (outcome.kind === "finalize_verified") {
    await finalizeAttestation(client, id, { result: "verified", derivedTxHash: outcome.derivedTxHash });
    return;
  }
  await finalizeAttestation(client, id, { result: "mismatch", detail: outcome.detail });
}
