import type { ChainEntry } from "@agentscan/core";
import type { Config } from "../config.js";

export function rpcUrlsFor(entry: ChainEntry, config: Config): string[] {
  return [...new Set([...(config.rpcUrlOverrides.get(entry.canonicalSlug) ?? []), ...entry.rpcUrls])];
}
