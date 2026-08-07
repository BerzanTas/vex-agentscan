import type { ProtocolStatDto } from "../lib/api";
import { ProtocolBadge } from "./ProtocolBadge";
import { RankingList } from "./RankingList";

export function ProtocolRanking({ protocols }: { protocols: ProtocolStatDto[] }) {
  return (
    <RankingList
      gradientPrefix="cobalt-protocol-bar"
      emptyMessage="No verified activity yet"
      rows={protocols.map((entry) => ({
        key: entry.protocol,
        label: <ProtocolBadge protocol={entry.protocol} withName />,
        volumeUsd: entry.volumeUsd,
        txCount: entry.txCount,
      }))}
    />
  );
}
