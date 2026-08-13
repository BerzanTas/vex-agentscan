export type ErrorEnvelope = { error: { code: string; message: string } };
export type AgentStatus = "active" | "revoked" | "quarantined";
export type AgentIngestHealth = { strikeCount: number; status: AgentStatus };
export type EventsResult = {
  accepted: number;
  duplicates: number;
  rejected: { index: number; code: "validation_failed" }[];
  agent: AgentIngestHealth;
};
