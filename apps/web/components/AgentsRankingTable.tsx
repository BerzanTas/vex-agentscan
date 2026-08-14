import type { AgentStatDto } from "../lib/api";
import { formatAge, formatUsdCompact, formatUsdAmount } from "../lib/format";
import { AgentName } from "./AgentName";
import { EmptyPanel } from "./EmptyPanel";

function countLabel(count: number): string {
  return count.toLocaleString("en-US");
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
            <th className="table-head hidden font-normal md:table-cell">Protocols</th>
            <th className="table-head hidden font-normal md:table-cell">Chains</th>
            <th className="table-head hidden font-normal md:table-cell">Last seen</th>
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
              <td className="hidden font-mono text-xs text-text-secondary md:table-cell">
                {countLabel(agent.protocolCount)}
              </td>
              <td className="hidden font-mono text-xs text-text-secondary md:table-cell">
                {countLabel(agent.chainCount)}
              </td>
              <td className="hidden font-mono text-xs text-text-muted md:table-cell">
                {formatAge(agent.lastSeenSeconds)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
