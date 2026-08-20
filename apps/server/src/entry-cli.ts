import { Command } from "commander";
import type pg from "pg";
import { revokeTokenAttestations } from "./cli/attestation-revoke.js";
import { requeueUnpricedActivities } from "./cli/pricing-requeue.js";
import { listAgentsAwaitingPurge } from "./cli/purge-status.js";
import { liftQuarantine, listQuarantinedAgents } from "./cli/quarantine.js";
import { reopenVerification, type ReopenRefusal } from "./cli/verify-reopen.js";
import { retryVerification, type RetryRefusal } from "./cli/verify-retry.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { runPurgeSweep } from "./worker/purge.js";

async function withPool<T>(run: (pool: pg.Pool) => Promise<T>): Promise<T> {
  const config = loadConfig(process.env);
  const pool = createPool(config.DATABASE_URL, {
    max: config.DATABASE_POOL_MAX,
    connectionTimeoutMillis: config.DATABASE_POOL_ACQUIRE_TIMEOUT_MS,
  });
  try {
    return await run(pool);
  } finally {
    await pool.end();
  }
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

const program = new Command("agentscan");

const quarantine = program.command("quarantine");
quarantine
  .command("list")
  .description("list quarantined agents")
  .action(async () => {
    printJson(await withPool(listQuarantinedAgents));
  });
quarantine
  .command("lift")
  .description("lift quarantine and reset strikes for an agent")
  .argument("<agentHash>")
  .action(async (agentHash: string) => {
    const outcome = await withPool((pool) => liftQuarantine(pool, agentHash));
    if (!outcome.lifted) {
      process.stderr.write("agent is not quarantined\n");
      process.exitCode = 1;
      return;
    }
    printJson(outcome);
  });

const purge = program.command("purge");
purge
  .command("status")
  .description("list revoked agents awaiting purge")
  .action(async () => {
    printJson(await withPool(listAgentsAwaitingPurge));
  });
purge
  .command("run")
  .description("run one purge sweep")
  .action(async () => {
    const config = loadConfig(process.env);
    printJson(await withPool((pool) => runPurgeSweep(pool, config)));
  });

function retryRefusalMessage(refusal: RetryRefusal): string {
  if (refusal.refusal === "not_found") return "no activity with that public id";
  return `activity is not retryable in state ${refusal.state} with status ${refusal.status}`;
}

function reopenRefusalMessage(refusal: ReopenRefusal): string {
  if (refusal.refusal === "not_found") return "no activity with that public id";
  return `activity carries no mismatch verdict: state ${refusal.state}, status ${refusal.status}`;
}

const verify = program.command("verify");
verify
  .command("retry")
  .description("requeue verification of an activity closed as unverifiable, by public id")
  .argument("<publicId>")
  .action(async (publicId: string) => {
    const outcome = await withPool((pool) => retryVerification(pool, publicId));
    if (!outcome.requeued) {
      process.stderr.write(`${retryRefusalMessage(outcome)}
`);
      process.exitCode = 1;
      return;
    }
    printJson(outcome);
  });
verify
  .command("reopen")
  .description("withdraw a mismatch verdict and the strike it produced, requeueing the activity")
  .argument("<publicId>")
  .action(async (publicId: string) => {
    const { QUARANTINE_STRIKES } = loadConfig(process.env);
    const outcome = await withPool((pool) => reopenVerification(pool, publicId, QUARANTINE_STRIKES));
    if (!outcome.reopened) {
      process.stderr.write(`${reopenRefusalMessage(outcome)}
`);
      process.exitCode = 1;
      return;
    }
    printJson(outcome);
  });

program
  .command("pricing")
  .command("requeue")
  .description("re-open terminally unpriced activities for another pricing pass")
  .option("--chain-id <id>", "only requeue activities on this chain")
  .action(async (options: { chainId?: string }) => {
    const outcome = await withPool((pool) =>
      requeueUnpricedActivities(pool, options.chainId === undefined ? undefined : BigInt(options.chainId)),
    );
    printJson(outcome);
  });

const attestation = program.command("attestation");
attestation
  .command("revoke")
  .description("revoke every attestation row for a token, stamping revoked_at and revoke_reason")
  .argument("<chainId>")
  .argument("<tokenAddress>")
  .requiredOption("--reason <text>", "revocation reason")
  .action(async (chainId: string, tokenAddress: string, options: { reason: string }) => {
    const outcome = await withPool((pool) =>
      revokeTokenAttestations(pool, BigInt(chainId), tokenAddress.toLowerCase(), options.reason),
    );
    printJson(outcome);
  });

await program.parseAsync(process.argv);
