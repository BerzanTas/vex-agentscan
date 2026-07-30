import { randomBytes } from "node:crypto";

export function generatePublicId(): string {
  return randomBytes(16).toString("hex");
}
