const AGENT_NAME_PREFIX = "Vex-";
const AGENT_NAME_HEX_LENGTHS = [8, 12, 16] as const;

export function agentNameCandidates(agentHash: string): string[] {
  return AGENT_NAME_HEX_LENGTHS.map((hexLength) => `${AGENT_NAME_PREFIX}${agentHash.slice(0, hexLength)}`);
}
