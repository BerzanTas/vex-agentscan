import { z } from "zod";
import { CHAIN_FAMILIES, EVENT_KINDS, EVENT_ROLES, EVENT_STATUSES, FAILURE_CODES } from "./enums.js";

const rawAmount = z.string().regex(/^\d+$/);
const usdString = z.string().regex(/^\d+(\.\d+)?$/);
const isoDate = z.iso.datetime();
const token = z.object({ address: z.string().min(1), symbol: z.string().max(16), decimals: z.number().int() });

export const eventSchema = z.object({
  sourceRowId: z.string().min(1),
  sourceExecutionId: z.string().min(1),
  eventIndex: z.number().int().min(0),
  kind: z.enum(EVENT_KINDS),
  eventRole: z.enum(EVENT_ROLES),
  status: z.enum(EVENT_STATUSES),
  protocol: z.string().min(1).max(32),
  chainFamily: z.enum(CHAIN_FAMILIES),
  chainId: z.coerce.bigint(),
  fromChainId: z.coerce.bigint().nullish().default(null),
  toChainId: z.coerce.bigint().nullish().default(null),
  tokenIn: token.nullish().default(null),
  tokenOut: token.nullish().default(null),
  amountInRaw: rawAmount.nullish().default(null),
  amountOutRaw: rawAmount.nullish().default(null),
  executedInRaw: rawAmount.nullish().default(null),
  executedOutRaw: rawAmount.nullish().default(null),
  usdInEst: usdString.nullish().default(null),
  usdOutEst: usdString.nullish().default(null),
  usdFeeEst: usdString.nullish().default(null),
  usdSource: z.string().max(32).nullish().default(null),
  txHash: z.string().nullish().default(null),
  failureCode: z.enum(FAILURE_CODES).nullish().default(null),
  createdAt: isoDate,
  confirmedAt: isoDate.nullish().default(null),
  observedAt: isoDate.nullish().default(null),
});
export type IngestEvent = z.infer<typeof eventSchema>;

export const eventsBatchSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  agentHash: z.string().regex(/^[0-9a-f]{64}$/),
  backfill: z.boolean().default(false),
  events: z.array(z.unknown()),
});
