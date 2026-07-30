export type ErrorEnvelope = { error: { code: string; message: string } };
export type EventsResult = { accepted: number; duplicates: number; rejected: { index: number; code: "validation_failed" }[] };
