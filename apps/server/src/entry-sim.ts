import { Command } from "commander";
import type { IngestEvent } from "@agentscan/contract";
import {
  checkSimApiUrl,
  deriveSimAgents,
  generateBackfill,
  initialLiveState,
  mulberry32,
  nextLiveScenario,
  type SimAgent,
  type SimLiveState,
  type SimRng,
} from "./sim/generator.js";

const apiUrl = process.env.SIM_API_URL ?? "http://localhost";
const SERVER_ERROR_BACKOFF_SEC = [1, 2, 5, 10, 30] as const;

type EventsResult = { accepted: number; duplicates: number; rejected: { index: number; code: string }[] };

class FatalApiError extends Error {}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logLine(line: string): void {
  process.stdout.write(`${line}\n`);
}

function failWith(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function ensureLocalTarget(allowRemote: boolean): void {
  const decision = checkSimApiUrl(apiUrl, allowRemote);
  if (!decision.ok) failWith(decision.reason);
}

function jsonWithBigintsAsStrings(body: unknown): string {
  return JSON.stringify(body, (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value));
}

async function fetchResponseOrNull(url: string, payload: string, headers: Record<string, string>): Promise<Response | null> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: payload,
    });
  } catch {
    return null;
  }
}

function errorEnvelopeText(body: unknown): string {
  if (body !== null && typeof body === "object" && "error" in body) {
    const envelope = (body as { error: { code?: string; message?: string } }).error;
    return `code=${envelope.code ?? "unknown"} message=${envelope.message ?? ""}`;
  }
  return "code=unknown message=unparseable error body";
}

async function postJson(path: string, body: unknown, headers: Record<string, string>): Promise<unknown> {
  const url = new URL(path, apiUrl).toString();
  const payload = jsonWithBigintsAsStrings(body);
  let serverErrorAttempts = 0;
  for (;;) {
    const response = await fetchResponseOrNull(url, payload, headers);
    if (response !== null && response.ok) return response.json();
    if (response !== null && response.status === 429) {
      const retryAfterSec = Number(response.headers.get("retry-after") ?? "1");
      logLine(`rate limited on ${path}; waiting ${retryAfterSec}s`);
      await sleep(retryAfterSec * 1000);
      continue;
    }
    if (response !== null && response.status < 500) {
      const envelope: unknown = await response.json().catch(() => null);
      throw new FatalApiError(`${path} responded ${response.status}: ${errorEnvelopeText(envelope)}`);
    }
    const backoffSec = SERVER_ERROR_BACKOFF_SEC[serverErrorAttempts];
    if (backoffSec === undefined) {
      throw new FatalApiError(`${path} kept failing after ${serverErrorAttempts} retries`);
    }
    serverErrorAttempts += 1;
    logLine(`${path} ${response === null ? "unreachable" : `responded ${response.status}`}; retrying in ${backoffSec}s`);
    await sleep(backoffSec * 1000);
  }
}

async function registerAgents(agents: SimAgent[]): Promise<void> {
  for (const [index, agent] of agents.entries()) {
    await postJson(
      "/v1/agents/register",
      {
        agentHash: agent.agentHash,
        ingestToken: agent.ingestToken,
        consentVersion: 1,
        acceptedAt: new Date().toISOString(),
        appVersion: "sim",
      },
      {},
    );
    logLine(`registered agent=${index} hash=${agent.agentHash.slice(0, 8)}…`);
  }
}

async function sendBatch(agent: SimAgent, events: IngestEvent[], backfill: boolean, label: string): Promise<void> {
  const result = (await postJson(
    "/v1/events",
    { schemaVersion: 1, agentHash: agent.agentHash, backfill, events },
    { authorization: `Bearer ${agent.ingestToken}` },
  )) as EventsResult;
  logLine(
    `${label} events=${events.length} accepted=${result.accepted} duplicates=${result.duplicates} rejected=${result.rejected.length}`,
  );
}

function agentRng(seed: number, agentIndex: number): SimRng {
  return mulberry32((seed ^ Math.imul(agentIndex + 1, 0x85ebca6b)) >>> 0);
}

type BackfillCliOptions = { days: string; agents: string; perDay: string; seed: string; allowRemote: boolean };

async function runBackfill(options: BackfillCliOptions): Promise<void> {
  ensureLocalTarget(options.allowRemote);
  const days = Number.parseInt(options.days, 10);
  const agentCount = Number.parseInt(options.agents, 10);
  const perDayTotal = Number.parseFloat(options.perDay);
  const seed = Number.parseInt(options.seed, 10);
  const agents = deriveSimAgents(seed, agentCount);
  await registerAgents(agents);
  const now = new Date();
  for (const [index, agent] of agents.entries()) {
    const batches = generateBackfill(agentRng(seed, index), { days, perDay: perDayTotal / agentCount, now });
    for (const [batchIndex, batch] of batches.entries()) {
      await sendBatch(agent, batch, true, `backfill agent=${index} batch=${batchIndex + 1}/${batches.length}`);
    }
  }
}

type LiveCliOptions = { minInterval: string; maxInterval: string; agents: string; seed: string; allowRemote: boolean };

type ScheduledFollowUp = { timer: NodeJS.Timeout; send: () => Promise<void> };

class LiveLoop {
  private readonly followUps = new Set<ScheduledFollowUp>();
  private readonly inFlight = new Set<Promise<void>>();
  private nextScenarioTimer: NodeJS.Timeout | null = null;
  private stopping = false;
  private readonly states: SimLiveState[];

  constructor(
    private readonly rng: SimRng,
    private readonly agents: SimAgent[],
    private readonly minIntervalMs: number,
    private readonly maxIntervalMs: number,
  ) {
    this.states = agents.map(() => initialLiveState(rng, new Date()));
  }

  start(): void {
    process.on("SIGINT", () => void this.shutdown());
    this.runScenario();
  }

  private runScenario(): void {
    if (this.stopping) return;
    const agentIndex = Math.floor(this.rng() * this.agents.length);
    const agent = this.agents[agentIndex];
    const state = this.states[agentIndex];
    if (agent === undefined || state === undefined) return;
    const scenario = nextLiveScenario(this.rng, { ...state, now: new Date() });
    this.states[agentIndex] = scenario.state;
    for (const step of scenario.steps) {
      const send = (): Promise<void> =>
        sendBatch(agent, [step.event], false, `live agent=${agentIndex} scenario=${scenario.label} status=${step.event.status}`);
      if (step.afterMs === 0) this.track(send());
      else this.scheduleFollowUp(step.afterMs, send);
    }
    const intervalMs = this.minIntervalMs + Math.floor(this.rng() * (this.maxIntervalMs - this.minIntervalMs + 1));
    this.nextScenarioTimer = setTimeout(() => this.runScenario(), intervalMs);
  }

  private scheduleFollowUp(afterMs: number, send: () => Promise<void>): void {
    const followUp: ScheduledFollowUp = {
      send,
      timer: setTimeout(() => {
        this.followUps.delete(followUp);
        this.track(send());
      }, afterMs),
    };
    this.followUps.add(followUp);
  }

  private track(sending: Promise<void>): void {
    const tracked = sending.catch((error: unknown) => {
      if (!(error instanceof FatalApiError)) throw error;
      process.stderr.write(`${error.message}\n`);
      void this.shutdown(1);
    });
    this.inFlight.add(tracked);
    void tracked.finally(() => this.inFlight.delete(tracked));
  }

  private async shutdown(exitCode = 0): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    if (this.nextScenarioTimer !== null) clearTimeout(this.nextScenarioTimer);
    const remaining = [...this.followUps];
    this.followUps.clear();
    for (const followUp of remaining) {
      clearTimeout(followUp.timer);
      this.track(followUp.send());
    }
    logLine(`stopping: flushing ${remaining.length} scheduled follow-ups`);
    await Promise.allSettled([...this.inFlight]);
    logLine("sim live stopped");
    process.exit(exitCode);
  }
}

async function runLive(options: LiveCliOptions): Promise<void> {
  ensureLocalTarget(options.allowRemote);
  const seed = Number.parseInt(options.seed, 10);
  const agents = deriveSimAgents(seed, Number.parseInt(options.agents, 10));
  await registerAgents(agents);
  const rng = mulberry32((seed ^ Date.now()) >>> 0);
  const minIntervalMs = Number.parseFloat(options.minInterval) * 1000;
  const maxIntervalMs = Number.parseFloat(options.maxInterval) * 1000;
  new LiveLoop(rng, agents, minIntervalMs, maxIntervalMs).start();
  logLine(`live loop started against ${apiUrl} (Ctrl+C to stop)`);
}

const program = new Command("agentscan-sim");

program
  .command("backfill")
  .description("seed historical activity through the real ingest API")
  .option("--days <days>", "how many past days to fill", "30")
  .option("--agents <agents>", "how many fake agents to use", "4")
  .option("--per-day <perDay>", "activities per day across all agents", "10")
  .option("--seed <seed>", "deterministic identity and data seed", "1337")
  .option("--allow-remote", "permit a non-local SIM_API_URL host", false)
  .action(runBackfill);

program
  .command("live")
  .description("continuously drive live-looking activity through the real ingest API")
  .option("--min-interval <seconds>", "minimum pause between scenarios", "1")
  .option("--max-interval <seconds>", "maximum pause between scenarios", "5")
  .option("--agents <agents>", "how many fake agents to use", "4")
  .option("--seed <seed>", "deterministic identity seed", "1337")
  .option("--allow-remote", "permit a non-local SIM_API_URL host", false)
  .action(runLive);

try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (!(error instanceof FatalApiError)) throw error;
  failWith(error.message);
}
