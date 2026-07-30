import { z } from "zod";
export const registerRequestSchema = z.object({
  agentHash: z.string().regex(/^[0-9a-f]{64}$/),
  ingestToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  consentVersion: z.number().int().min(1),
  acceptedAt: z.iso.datetime(),
  appVersion: z.string().max(32).optional(),
});
