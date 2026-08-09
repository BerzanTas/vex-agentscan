import type { AgentChainStatDto, ProtocolStatDto } from "../lib/api";
import { publishableLabel } from "../lib/public-label";
import { AgentPageBreakdownTable, type AgentPageBreakdownRow } from "./AgentPageBreakdownTable";
import { ChainBadge } from "./ChainBadge";
import { PanelHeading } from "./PanelHeading";
import { ProtocolBadge } from "./ProtocolBadge";

const UNKNOWN_PROTOCOL = "unknown protocol";
const UNKNOWN_CHAIN = "unknown chain";

function protocolRows(protocols: ProtocolStatDto[]): AgentPageBreakdownRow[] {
  return protocols.map((entry) => ({
    key: entry.protocol,
    label: <ProtocolBadge protocol={publishableLabel(entry.protocol, UNKNOWN_PROTOCOL)} withName />,
    volumeUsd: entry.volumeUsd,
    txCount: entry.txCount,
  }));
}

function chainRows(chains: AgentChainStatDto[]): AgentPageBreakdownRow[] {
  return chains.map((entry) => ({
    key: entry.chainSlug ?? UNKNOWN_CHAIN,
    label: <ChainBadge slug={publishableLabel(entry.chainSlug, UNKNOWN_CHAIN)} />,
    volumeUsd: entry.volumeUsd,
    txCount: entry.txCount,
  }));
}

export function AgentPageBreakdowns({
  protocols,
  chains,
}: {
  protocols: ProtocolStatDto[];
  chains: AgentChainStatDto[];
}) {
  return (
    <div className="section-enter grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
      <section className="glass p-4">
        <PanelHeading title="Protocols" meta="PRICED VOLUME" />
        <AgentPageBreakdownTable
          dimension="Protocol"
          rows={protocolRows(protocols)}
          emptyMessage="No priced protocol activity"
        />
      </section>
      <section className="glass p-4">
        <PanelHeading title="Chains" meta="PRICED VOLUME" />
        <AgentPageBreakdownTable
          dimension="Chain"
          rows={chainRows(chains)}
          emptyMessage="No priced chain activity"
        />
      </section>
    </div>
  );
}
