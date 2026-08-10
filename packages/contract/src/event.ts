import { z } from "zod";
import { CHAIN_FAMILIES, EVENT_KINDS, EVENT_ROLES, EVENT_STATUSES, FAILURE_CODES } from "./enums.js";
import { INPUT_LEG_FORBIDDEN_ROLES, SECOND_LEG_ROLES, isRoleBoundToKind } from "./role-binding.js";

const rawAmount = z.string().regex(/^\d+$/);
const usdString = z.string().regex(/^\d+(\.\d+)?$/);
const isoDate = z.iso.datetime();
const token = z.object({ address: z.string().min(1), symbol: z.string().max(16), decimals: z.number().int() });

const eventShape = z.object({
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
  tokenIn2: token.nullish().default(null),
  tokenOut2: token.nullish().default(null),
  amountIn2Raw: rawAmount.nullish().default(null),
  amountOut2Raw: rawAmount.nullish().default(null),
  executedIn2Raw: rawAmount.nullish().default(null),
  executedOut2Raw: rawAmount.nullish().default(null),
  usdInEst: usdString.nullish().default(null),
  usdOutEst: usdString.nullish().default(null),
  usdFeeEst: usdString.nullish().default(null),
  usdNetworkGasEst: usdString.nullish().default(null),
  usdVenueFeeEst: usdString.nullish().default(null),
  usdVexFeeEst: usdString.nullish().default(null),
  usdDestinationPrepayEst: usdString.nullish().default(null),
  usdSource: z.string().max(32).nullish().default(null),
  txHash: z.string().nullish().default(null),
  failureCode: z.enum(FAILURE_CODES).nullish().default(null),
  createdAt: isoDate,
  confirmedAt: isoDate.nullish().default(null),
  observedAt: isoDate.nullish().default(null),
});

type EventShape = z.output<typeof eventShape>;

const SECOND_LEG_FIELDS = [
  "tokenIn2",
  "tokenOut2",
  "amountIn2Raw",
  "amountOut2Raw",
  "executedIn2Raw",
  "executedOut2Raw",
] as const satisfies readonly (keyof EventShape)[];

const INPUT_LEG_FIELDS = ["tokenIn", "amountInRaw", "executedInRaw"] as const satisfies readonly (keyof EventShape)[];

function populatedFields(
  event: EventShape,
  fields: readonly (keyof EventShape)[],
): readonly (keyof EventShape)[] {
  return fields.filter((field) => event[field] !== null && event[field] !== undefined);
}

function checkRoleBoundToKind(event: EventShape, ctx: z.RefinementCtx): void {
  if (isRoleBoundToKind(event.kind, event.eventRole)) return;
  ctx.addIssue({
    code: "custom",
    path: ["eventRole"],
    message: `§4.2 kind/role binding: eventRole '${event.eventRole}' is not valid for kind '${event.kind}'`,
  });
}

function checkSecondLegRoleAllowed(event: EventShape, ctx: z.RefinementCtx): void {
  if (SECOND_LEG_ROLES.includes(event.eventRole)) return;
  for (const field of populatedFields(event, SECOND_LEG_FIELDS)) {
    ctx.addIssue({
      code: "custom",
      path: [field],
      message: `§4.2 second leg: '${field}' is only allowed for roles ${SECOND_LEG_ROLES.join("/")}`,
    });
  }
}

function checkSecondLegAmountNamesItsToken(event: EventShape, ctx: z.RefinementCtx): void {
  checkLegAmountNamesItsToken(event, ctx, "tokenIn2", ["amountIn2Raw", "executedIn2Raw"]);
  checkLegAmountNamesItsToken(event, ctx, "tokenOut2", ["amountOut2Raw", "executedOut2Raw"]);
}

function checkLegAmountNamesItsToken(
  event: EventShape,
  ctx: z.RefinementCtx,
  tokenField: "tokenIn2" | "tokenOut2",
  amountFields: readonly (keyof EventShape)[],
): void {
  if (event[tokenField] != null) return;
  for (const field of populatedFields(event, amountFields)) {
    ctx.addIssue({
      code: "custom",
      path: [field],
      message: `§4.2 second leg: '${field}' requires '${tokenField}' carrying its decimals`,
    });
  }
}

function checkInputLegForbidden(event: EventShape, ctx: z.RefinementCtx): void {
  if (!INPUT_LEG_FORBIDDEN_ROLES.includes(event.eventRole)) return;
  for (const field of populatedFields(event, INPUT_LEG_FIELDS)) {
    ctx.addIssue({
      code: "custom",
      path: [field],
      message: `§4.2 input leg: role '${event.eventRole}' spends nothing and must not carry '${field}'`,
    });
  }
}

function checkSupersededCarriesNoFailureCode(event: EventShape, ctx: z.RefinementCtx): void {
  if (event.status !== "superseded_unproven" || event.failureCode == null) return;
  ctx.addIssue({
    code: "custom",
    path: ["failureCode"],
    message: "§4.2 status: 'superseded_unproven' is a non-failure terminal state and carries no failureCode",
  });
}

export const eventSchema = eventShape.superRefine((event, ctx) => {
  checkRoleBoundToKind(event, ctx);
  checkSecondLegRoleAllowed(event, ctx);
  checkSecondLegAmountNamesItsToken(event, ctx);
  checkInputLegForbidden(event, ctx);
  checkSupersededCarriesNoFailureCode(event, ctx);
});
export type IngestEvent = z.infer<typeof eventSchema>;

export const eventsBatchSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  agentHash: z.string().regex(/^[0-9a-f]{64}$/),
  backfill: z.boolean().default(false),
  events: z.array(z.unknown()),
});
