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
