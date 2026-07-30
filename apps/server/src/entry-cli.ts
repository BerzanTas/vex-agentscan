import { Command } from "commander";
import type pg from "pg";
import { listAgentsAwaitingPurge } from "./cli/purge-status.js";
import { liftQuarantine, listQuarantinedAgents } from "./cli/quarantine.js";
import { retryVerification } from "./cli/verify-retry.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";

async function withPool<T>(run: (pool: pg.Pool) => Promise<T>): Promise<T> {
  const pool = createPool(loadConfig(process.env).DATABASE_URL);
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

program
  .command("purge")
  .command("status")
  .description("list revoked agents awaiting purge")
  .action(async () => {
    printJson(await withPool(listAgentsAwaitingPurge));
  });

program
  .command("verify")
  .command("retry")
  .description("requeue verification of an activity by public id")
  .argument("<publicId>")
  .action(async (publicId: string) => {
    const outcome = await withPool((pool) => retryVerification(pool, publicId));
    if (!outcome.requeued) {
      process.stderr.write("no activity with that public id\n");
      process.exitCode = 1;
      return;
    }
    printJson(outcome);
  });

await program.parseAsync(process.argv);
