import type { AgentStatDto } from "../lib/api";
import { AgentName } from "./AgentName";
import { RankingList } from "./RankingList";

export function AgentRanking({ agents }: { agents: AgentStatDto[] }) {
  return (
    <RankingList
      gradientPrefix="cobalt-agent-bar"
      emptyMessage="No verified activity yet"
      rows={agents.map((entry) => ({
        key: entry.alias,
        label: (
          <span className="font-mono">
            <AgentName agent={entry} />
          </span>
        ),
        volumeUsd: entry.volumeUsd,
        txCount: entry.txCount,
      }))}
    />
  );
}
