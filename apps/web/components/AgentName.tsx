import Link from "next/link";
import type { AgentStatDto } from "../lib/api";

function agentPageHref(name: string): string {
  return `/agent/${encodeURIComponent(name)}`;
}

export function AgentName({ agent }: { agent: AgentStatDto }) {
  const name = agent.name ?? null;
  if (name === null) return <>{agent.alias}</>;
  return (
    <Link href={agentPageHref(name)} className="text-text-primary">
      {name}
    </Link>
  );
}
