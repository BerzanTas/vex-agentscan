import Link from "next/link";
import type { AgentStatDto } from "../lib/api";
import { formatAge, formatUsdCompact, formatUsdAmount } from "../lib/format";
import { EmptyPanel } from "./EmptyPanel";

function countLabel(count: number): string {
  return count.toLocaleString("en-US");
}

function agentPageHref(name: string): string {
  return `/agent/${encodeURIComponent(name)}`;
}

function AgentName({ agent }: { agent: AgentStatDto }) {
  const name = agent.name ?? null;
  if (name === null) return <>{agent.alias}</>;
  return (
    <Link href={agentPageHref(name)} className="text-text-primary">
      {name}
    </Link>
  );
}

export function AgentsRankingTable({
  agents,
  emptyMessage,
}: {
  agents: AgentStatDto[];
  emptyMessage: string;
}) {
  if (agents.length === 0) {
    return <EmptyPanel message={emptyMessage} />;
  }
  return (
    <div className="glass overflow-x-auto">
      <table className="dimension-table">
        <thead>
          <tr>
            <th className="table-head font-normal">#</th>
            <th className="table-head font-normal">Agent</th>
            <th className="table-head font-normal">Observed volume</th>
            <th className="table-head font-normal">Txns</th>
            <th className="table-head font-normal">Protocols</th>
            <th className="table-head font-normal">Chains</th>
            <th className="table-head font-normal">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent, index) => (
            <tr key={agent.alias}>
              <td className="font-mono text-xs text-text-muted">{index + 1}</td>
              <td className="font-mono text-text-primary">
                <AgentName agent={agent} />
              </td>
              <td
                className="whitespace-nowrap font-mono text-text-primary"
                title={`$${formatUsdAmount(agent.volumeUsd)}`}
              >
                ${formatUsdCompact(agent.volumeUsd)}
              </td>
              <td className="font-mono text-xs text-text-secondary">{countLabel(agent.txCount)}</td>
              <td className="font-mono text-xs text-text-secondary">
                {countLabel(agent.protocolCount)}
              </td>
              <td className="font-mono text-xs text-text-secondary">
                {countLabel(agent.chainCount)}
              </td>
              <td className="font-mono text-xs text-text-muted">{formatAge(agent.lastSeenSeconds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
