# Operator observability

Three signals an operator needs without DB access, before the reporting feature
goes default-on. No metrics framework, no new public API — structured stdout
logs plus an extended strict `healthz`.

All logs are pino JSON lines on stdout, shipped by Container Apps into the Log
Analytics workspace declared in `infra/observability.tf`
(`azurerm_log_analytics_workspace.main`, linked to the environment via
`log_analytics_workspace_id` in `infra/environment.tf`). Container Apps writes
console output to the `ContainerAppConsoleLogs_CL` table, one row per line,
with the raw text in `Log_s` and the emitting app in `ContainerAppName_s`
(`api` for the ingest/read server, `worker` for the verification loop — see
`infra/apps.tf`).

## 1. Ingest outcomes — `rejected > 0` is a client bug

**What it means.** `POST /v1/events` logs exactly one `"ingest batch outcome"`
line per processed batch (`apps/server/src/routes/events.ts`), with
`{accepted, duplicates, rejected, events, backfill}`. `rejected` is a count,
not the per-item array returned in the HTTP response. Nothing beyond these
counts and the `backfill` flag is logged — no `agentHash`, matching the
redaction posture already used for the banned-field warning in the same
route.

Batches that never reach ingestion (bad token, wrong `agentHash`, revoked/
quarantined agent, rate limited, oversized) do not produce this line — there
is nothing to count.

The contract is validated server-side (`eventSchema`) before an event is
accepted, so a nonzero `rejected` count on an otherwise-authenticated batch
means the calling agent sent malformed events — by definition a client bug,
never a server-side condition.

**Log query (Azure Log Analytics / Container Apps logs).**

```kusto
ContainerAppConsoleLogs_CL
| where ContainerAppName_s == "api"
| where Log_s has "ingest batch outcome"
| extend parsed = parse_json(Log_s)
| project TimeGenerated,
          accepted = toint(parsed.accepted),
          duplicates = toint(parsed.duplicates),
          rejected = toint(parsed.rejected),
          events = toint(parsed.events),
          backfill = tobool(parsed.backfill)
| order by TimeGenerated desc
```

**Alert condition.** `rejected > 0` on any single line — any occurrence, not
a rate or threshold:

```kusto
ContainerAppConsoleLogs_CL
| where ContainerAppName_s == "api"
| where Log_s has "ingest batch outcome"
| extend parsed = parse_json(Log_s)
| where toint(parsed.rejected) > 0
| project TimeGenerated, accepted = parsed.accepted, rejected = parsed.rejected, events = parsed.events
```

## 2. Verification queue health — depth and staleness

**What it means.** Each worker poll (`apps/server/src/worker/loop.ts`,
`runVerificationPass`, one call per `WORKER_POLL_INTERVAL_SEC` tick) logs a
`"verification queue depth"` line at info level, but only when the queue is
non-empty — an idle worker stays silent. Fields:

- `dueJobs` — rows in `verification_jobs` with `next_attempt_at <= now()`:
  work that is ready and unclaimed right now. This is the same predicate the
  `worker` container app's KEDA scale rule uses (`infra/apps.tf`,
  `custom_scale_rule "verification-queue"`), so "queue depth" here means the
  same thing operators already see driving worker scale-out.
- `totalPending` — every row in `verification_jobs`, due or not (includes
  jobs still in backoff).
- `oldestDueAgeSec` — how long the oldest *due* job has been waiting past its
  `next_attempt_at`, or `null` when nothing is due.

The repo query backing this (`queueDepth` in
`apps/server/src/repos/activities-verify-repo.ts`) lives beside
`claimDueJobs` and reads `next_attempt_at` the same way the claim query does,
before any claiming happens for that pass — so the numbers reflect the
backlog the pass is about to work, not what it already took.

**Log query.**

```kusto
ContainerAppConsoleLogs_CL
| where ContainerAppName_s == "worker"
| where Log_s has "verification queue depth"
| extend parsed = parse_json(Log_s)
| project TimeGenerated,
          dueJobs = toint(parsed.dueJobs),
          totalPending = toint(parsed.totalPending),
          oldestDueAgeSec = todouble(parsed.oldestDueAgeSec)
| order by TimeGenerated desc
```

**Alert condition.** `dueJobs` growing across 3 consecutive polls — the
worker is falling behind, not just momentarily busy:

```kusto
ContainerAppConsoleLogs_CL
| where ContainerAppName_s == "worker"
| where Log_s has "verification queue depth"
| extend parsed = parse_json(Log_s)
| project TimeGenerated, dueJobs = toint(parsed.dueJobs)
| sort by TimeGenerated asc
| extend prevDueJobs = prev(dueJobs)
| where isnotnull(prevDueJobs)
| top 3 by TimeGenerated desc
| order by TimeGenerated asc
| where dueJobs > prevDueJobs
| count
// fires when the result is 3: every one of the last 3 polls grew over its predecessor
```

`oldestDueAgeSec` is worth eyeballing alongside this: a shallow but very old
queue (low `dueJobs`, high `oldestDueAgeSec`) points at a stuck job rather
than a growing one.

## 3. Worker heartbeat staleness

**What it means.** `GET /healthz?strict=1` already fails this: it returns
503 whenever the newest `worker_heartbeat.beat_at` is missing or older than
`WORKER_HEARTBEAT_MAX_AGE_SEC` (`apps/server/src/routes/health.ts`). This
task adds no new behavior here — status semantics (200/503) are unchanged —
it only adds `verificationQueue` to the strict response body:

```json
{
  "db": "ok",
  "workerAgeSec": 4.2,
  "verificationQueue": { "depth": 3, "oldestDueAgeSec": 12.7 }
}
```

`verificationQueue.depth` is `dueJobs` from the query above; `oldestDueAgeSec`
is the same field. Non-strict `/healthz` is unchanged and does not carry
`verificationQueue`.

**Operational note.** The `api` container app's built-in `readiness_probe`
(`infra/apps.tf`) hits plain `/healthz`, not `?strict=1` — that only checks
DB reachability, not heartbeat freshness, so Container Apps will not restart
or fail readiness on a dead worker. Point an external check (uptime monitor,
scheduled Log Analytics alert, or a Container Apps health probe reconfigured
to the strict path) at `/healthz?strict=1` on an interval shorter than
`WORKER_HEARTBEAT_MAX_AGE_SEC` to actually catch this.

**Alert condition.** Any non-200 from `GET /healthz?strict=1`.

## 4. Pricing coverage — the number read before the explorer goes public

**What it means.** Every USD figure the explorer publishes is computed by the
pricing lane (`apps/server/src/worker/pricing-loop.ts`, `runPricingPass`, one
call per `PRICING_POLL_INTERVAL_SEC` tick); client-supplied `usd*Est` values
are never summed into a public figure. Each pass that claimed at least one
activity logs one `"pricing coverage"` line at info level:

```json
{
  "processed": 50,
  "serverPriced": 46,
  "unpriceable": 1,
  "nothingToPrice": 0,
  "rescheduled": 3,
  "byChainProtocol": [
    { "chainSlug": "base", "chainFamily": "eip155", "chainId": "8453",
      "protocol": "kyberswap", "serverPriced": 40, "unpriceable": 0,
      "nothingToPrice": 0 }
  ]
}
```

- `serverPriced` — activities that reached `pricing_state = 'server_priced'`
  in this pass: every present leg was priced from a gate-accepted feed point.
- `unpriceable` — activities that reached the **terminal** `pricing_state =
  'unpriced'` **because pricing failed**: `PRICING_MAX_ATTEMPTS` exhausted, or
  a leg whose chain or token address has no coin key at all. This is the only
  terminal counter that belongs in the coverage ratio.
- `nothingToPrice` — activities that reached the same terminal
  `pricing_state = 'unpriced'` because there was **nothing to price**: no leg
  carried an amount, a token address and decimals. A `launch` event is the
  ordinary case. These are **excluded from the ratio on purpose** — counting
  them as failures would depress the launch-gate number permanently with zero
  feed involvement.
- `rescheduled` — still `pending`, backed off, and not yet on any side of
  the ratio.
- `byChainProtocol` — the same three counters split per `(chain, protocol)`,
  sorted deterministically. This is where a single broken feed key shows up
  while the global number still looks healthy.

Both terminal counters land in `pricing_state = 'unpriced'` in the database and
both are disclosed by `/api/pricing-coverage`; the split exists so the operator
can tell a feed problem from a legless row.

**Log query.**

```kusto
ContainerAppConsoleLogs_CL
| where ContainerAppName_s == "worker"
| where Log_s has "pricing coverage"
| extend parsed = parse_json(Log_s)
| project TimeGenerated,
          processed = toint(parsed.processed),
          serverPriced = toint(parsed.serverPriced),
          unpriceable = toint(parsed.unpriceable),
          nothingToPrice = toint(parsed.nothingToPrice),
          rescheduled = toint(parsed.rescheduled)
| extend coverage = todouble(serverPriced) / todouble(serverPriced + unpriceable)
| order by TimeGenerated desc
```

Per chain and protocol:

```kusto
ContainerAppConsoleLogs_CL
| where ContainerAppName_s == "worker"
| where Log_s has "pricing coverage"
| extend parsed = parse_json(Log_s)
| mv-expand slice = parsed.byChainProtocol
| summarize serverPriced = sum(toint(slice.serverPriced)),
            unpriceable = sum(toint(slice.unpriceable)),
            nothingToPrice = sum(toint(slice.nothingToPrice))
          by chainSlug = tostring(slice.chainSlug), protocol = tostring(slice.protocol),
             bin(TimeGenerated, 1h)
| extend coverage = todouble(serverPriced) / todouble(serverPriced + unpriceable)
| order by TimeGenerated desc
```

**What a sustained coverage drop means.** `serverPriced / (serverPriced +
unpriceable)` falling and staying down is not a load problem — the lane retries
on its own backoff and a transient feed outage shows up as `rescheduled`, not
as `unpriceable`. A sustained drop means one of:

- **A feed key broke.** A chain's `priceFeedKey`
  (`packages/core/src/chain-registry/chains.ts`) no longer matches what the
  upstream feed calls that chain, so every token on it resolves to a coin key
  the feed does not know. Signature: one `chainSlug` at ~0 coverage while the
  others are unchanged.
- **A chain lost support.** The feed stopped indexing that chain, or the
  agents moved onto a chain the registry lists without a `priceFeedKey` at
  all. Same signature; the difference is upstream, not in our registry.
- **A token is illiquid.** The feed answers, but below `PRICE_MIN_CONFIDENCE`
  or further than `PRICE_MAX_DRIFT_SEC` from the activity's own timestamp.
  Signature: coverage drops for one protocol on an otherwise healthy chain.
  This is the gate working — the feed's nearest point for an illiquid token
  can be days away, and publishing it would be a wrong number, not a stale one.

**Alert condition.** Coverage below 0.9 over a 6 hour window, evaluated per
chain as well as globally — a single chain at zero is invisible in the global
ratio until it is most of the volume.

**Launch gate.** This number is read **before the explorer goes public**, per
the Stage 4a design (§8). Low coverage at that point is a launch decision —
add a second price feed, or narrow which chains are published — not something
to discover from users after the fact.

### Recovering from a wrong feed key

`pricing_state = 'unpriced'` is terminal and nothing in the lane requeues it.
A chain's `priceFeedKey` was taken from the price feed's documentation rather
than a live call, so "the key was wrong all along" is a realistic first-staging
outcome — and by the time you read the coverage number, the affected activities
are already terminal and `token_prices` holds negative-cache rows that suppress
refetching for `PRICE_MISS_RETRY_HOURS`. Deploying the corrected key repairs
future rows only. Recover the existing ones by hand, in this order, after the
corrected key is deployed:

```sql
-- 1. drop the poisoned negative-cache rows for the affected chain, so the lane
--    may ask upstream again before PRICE_MISS_RETRY_HOURS elapses
DELETE FROM token_prices
WHERE price_usd IS NULL AND chain_family = 'eip155' AND chain_id = 8453;

-- 2. requeue the activities that failed against the wrong key. The leg
--    predicate matters: without it this also resurrects legless rows that were
--    correctly terminal, and they would burn the whole retry budget again.
UPDATE activities
SET pricing_state = 'pending', pricing_attempts = 0, pricing_next_attempt_at = NULL
WHERE pricing_state = 'unpriced'
  AND chain_family = 'eip155' AND chain_id = 8453
  AND (executed_in_raw IS NOT NULL OR executed_out_raw IS NOT NULL);
```

Substitute the affected `chain_family` / `chain_id`. Requeued rows re-enter the
lane at `PRICING_BATCH_MAX` per poll, and the next `"pricing coverage"` line
shows whether the new key worked. `daily_aggregates.volume_usd_priced` is
incremented only when the pricing CAS wins, and a requeued row's CAS runs again
from `pending`, so a successful second pass adds that row's volume exactly once.

## 5. Pricing divergence — server price vs client estimate

**What it means.** The reporting client keeps sending `usdInEst` / `usdOutEst`
over the ingest contract. They are no longer a publication source; they are a
second, independent measurement. When the lane prices a leg it compares the two
and, on a ratio outside `PRICE_DIVERGENCE_WARN_RATIO` in either direction,
emits one `"pricing divergence"` line at warn level:

```json
{
  "activityId": "1234",
  "chainSlug": "base",
  "chainFamily": "eip155",
  "chainId": "8453",
  "protocol": "kyberswap",
  "leg": "in",
  "tokenAddress": "0x4200000000000000000000000000000000000006",
  "pricedUsd": "2500",
  "estimateUsd": "100",
  "ratio": 25
}
```

The comparison is skipped when the client estimate is null or zero — there is
nothing to disagree with. **The warning never suppresses or alters the price
that is written:** a false positive blanking a legitimate number is worse than
publishing a flagged one an operator can review.

**Log query.**

```kusto
ContainerAppConsoleLogs_CL
| where ContainerAppName_s == "worker"
| where Log_s has "pricing divergence"
| extend parsed = parse_json(Log_s)
| project TimeGenerated,
          chainSlug = tostring(parsed.chainSlug),
          protocol = tostring(parsed.protocol),
          tokenAddress = tostring(parsed.tokenAddress),
          leg = tostring(parsed.leg),
          pricedUsd = tostring(parsed.pricedUsd),
          estimateUsd = tostring(parsed.estimateUsd),
          ratio = todouble(parsed.ratio)
| order by TimeGenerated desc
```

**Alert condition.** More than 5 divergences on the same `tokenAddress` within
an hour. One-off divergences are expected (a client estimate taken from a quote
rather than the settled trade); the same token disagreeing repeatedly points at
a wrong coin key or a decimals mismatch, and both produce published numbers
that are wrong rather than missing.

A related third-party signal is `"price feed unavailable for hour bucket"` at
warn level: the upstream feed rejected a whole batch. Those activities stay
`pending` and nothing is written to `token_prices`, so a transient outage can
never be mistaken for a permanent feed miss. Sustained occurrences mean the
feed, not the data.
