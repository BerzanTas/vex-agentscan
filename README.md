# AgentScan

Public explorer for Vex agent activity. Vex desktop installations report pseudonymous activity events, the server verifies each event against the chain it claims to have happened on, and the results are published as stats, charts and an activity feed. An event only counts once its transaction has been found on chain and the amounts and timing match what was reported.

## How it works

```
Vex installations
      │  activity events
      ▼
 API (Fastify) ──▶ PostgreSQL ◀── worker (on-chain verification, pricing)
                       │
                       ▼
              Next.js explorer site
```

- The **API** validates incoming events against the wire contract. Unknown fields are stripped; sensitive fields (wallet addresses, session identifiers) are dropped before anything touches the database.
- The **worker** pulls verification jobs from Postgres with `FOR UPDATE SKIP LOCKED`. No Redis, no message broker. Each event is checked through `viem`: the transaction exists, did not revert, and its amounts and block time match the report.
- The **web app** serves network stats, per-agent pages, token and protocol breakdowns, and the activity feed.

## Design decisions

- **Verify, never guess.** Event status moves one way, from pending to a terminal state, enforced with compare-and-swap at the SQL level. An unreachable RPC is a retry with backoff, never a verdict. A strike is only ever a proven mismatch.
- **Privacy by construction.** Sensitive fields are stripped at ingest and never stored. Public responses expose a random public id and nothing else; a test asserts every public DTO against a banned-field list, so a leak fails CI.
- **No floats for money.** Raw token amounts are strings end to end, TEXT in the database. Client-supplied USD estimates and server-priced aggregates are kept apart and never summed together.
- **The contract is a package.** All wire schemas live in `packages/contract`, covered by golden-file tests built from the contract document's examples. A wire format change turns a test red.

## Repository layout

```
apps/
  server/        Fastify API, verification worker, CLI and traffic simulator
                 (one image, separate entrypoints)
  web/           Next.js explorer (App Router, Tailwind, lightweight-charts)
packages/
  contract/      wire format schemas and types
  core/          pure domain logic, no I/O: chain registry, verification rules,
                 pricing, dedup, backoff
db/migrations/   plain SQL migrations, dbmate, expand-only
deploy/          Docker Compose, Caddyfile, Dockerfiles, backup and restore scripts
infra/           Terraform for the Azure environment
e2e/             Playwright smoke tests
```

## Stack

TypeScript (strict, ESM) on Node 22, pnpm workspace. Server: Fastify, zod, viem. Web: Next.js, Tailwind. PostgreSQL 17 for everything stateful, including the job queue and rate limiting. Tests: Vitest, Testcontainers, Playwright.

## Running locally

Requires Node 22, pnpm and Docker.

```bash
pnpm install
pnpm dev        # compose stack (Postgres, migrations, API, worker, Caddy)
                # plus the Next.js dev server
pnpm sim        # optional: feed the local stack with simulated traffic
```

Every tunable (rate limits, verification tolerances, backoff schedule, purge windows) is an environment variable documented in `.env.example` and validated at startup.

```bash
pnpm lint       # tsc --noEmit + eslint
pnpm test       # unit tests
pnpm test:int   # integration tests: real Postgres via Testcontainers,
                # full ingest -> verdict -> aggregate cycle
pnpm test:e2e   # Playwright smoke against the composed stack
pnpm build
```

The verifier is tested exclusively through fake chain readers (clean receipt, revert, missing transaction, mismatched amounts), never live RPC. Integration tests cover batch-retry idempotency, finalization races, and two workers competing over the same queue.

## Deployment

Production runs on Azure Container Apps, described in Terraform under `infra/`: three container apps (api, web, worker, with api and worker sharing one image), PostgreSQL Flexible Server, a migration job that applies dbmate migrations before rollout, a scheduled purge job, and a Log Analytics workspace with budget alerts.

The same images run anywhere Docker Compose does: `deploy/compose.yml` brings up the full stack behind Caddy and doubles as the local smoke environment, with backup and restore scripts alongside.

## Status

Actively developed. The wire contract is versioned, the server tolerates unknown fields, and migrations are expand-only, so deployed installations keep reporting across releases.
