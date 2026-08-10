import Link from "next/link";
import type { TokenStatDto } from "../lib/api";
import { formatAge, formatUsdCompact, formatUsdAmount } from "../lib/format";
import { ChainBadge } from "./ChainBadge";
import { EmptyPanel } from "./EmptyPanel";
import { ObservedVolumeCaveat, TOKEN_COLUMN_VOLUME_CAVEAT } from "./ObservedVolumeCaveat";
import { ProtocolBadge } from "./ProtocolBadge";
import { Sparkline } from "./Sparkline";

const ADDRESS_HEAD_LENGTH = 6;
const ADDRESS_TAIL_LENGTH = 4;
const MAX_PROTOCOL_ICONS = 3;
const VOLUME_CAVEAT_ID = "tokens-observed-volume-caveat";

export function shortenAddress(address: string): string {
  if (address.length <= ADDRESS_HEAD_LENGTH + ADDRESS_TAIL_LENGTH) return address;
  return `${address.slice(0, ADDRESS_HEAD_LENGTH)}…${address.slice(-ADDRESS_TAIL_LENGTH)}`;
}

export function tokenDetailHref(chainSlug: string, address: string): string {
  return `/tokens/${encodeURIComponent(chainSlug)}/${encodeURIComponent(address)}`;
}

function tokenLabel(token: TokenStatDto): string {
  return token.symbol ?? shortenAddress(token.address);
}

function TokenName({ token }: { token: TokenStatDto }) {
  if (token.symbol === null) {
    return (
      <span className="token-address" title={token.address}>
        {shortenAddress(token.address)}
      </span>
    );
  }
  return <span className="text-text-primary">{token.symbol}</span>;
}

function ProtocolIcons({ protocols }: { protocols: string[] }) {
  if (protocols.length === 0) return <span className="text-text-muted">—</span>;
  const shown = protocols.slice(0, MAX_PROTOCOL_ICONS);
  const hidden = protocols.length - shown.length;
  return (
    <span className="inline-flex items-center gap-1.5">
      {shown.map((protocol) => (
        <ProtocolBadge key={protocol} protocol={protocol} />
      ))}
      {hidden > 0 && <span className="font-mono text-xs text-text-muted">{`+${hidden}`}</span>}
    </span>
  );
}

export function TokensTable({ rows, emptyMessage }: { rows: TokenStatDto[]; emptyMessage: string }) {
  if (rows.length === 0) {
    return <EmptyPanel message={emptyMessage} />;
  }
  return (
    <div className="glass overflow-x-auto overflow-y-clip">
      <table className="dimension-table">
        <thead>
          <tr className="figure-note-anchor">
            <th className="table-head font-normal">#</th>
            <th className="table-head font-normal">Token</th>
            <th className="table-head font-normal">
              Observed volume
              <ObservedVolumeCaveat id={VOLUME_CAVEAT_ID} caveat={TOKEN_COLUMN_VOLUME_CAVEAT} />
            </th>
            <th className="table-head font-normal">Txns</th>
            <th className="table-head hidden font-normal md:table-cell">Agents</th>
            <th className="table-head hidden font-normal md:table-cell">Protocols</th>
            <th className="table-head hidden font-normal md:table-cell">7d</th>
            <th className="table-head hidden font-normal md:table-cell">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((token, index) => (
            <tr key={`${token.chainSlug}/${token.address}`} className="feed-row">
              <td className="font-mono text-xs text-text-muted">{index + 1}</td>
              <td>
                <Link
                  href={tokenDetailHref(token.chainSlug, token.address)}
                  className="feed-row-link token-cell"
                  aria-label={`${tokenLabel(token)} on ${token.chainSlug}`}
                >
                  <TokenName token={token} />
                  <ChainBadge slug={token.chainSlug} />
                </Link>
              </td>
              <td
                className="whitespace-nowrap font-mono text-text-primary"
                title={`$${formatUsdAmount(token.volumeUsd)}`}
              >
                ${formatUsdCompact(token.volumeUsd)}
              </td>
              <td className="font-mono text-xs text-text-secondary">
                {token.txCount.toLocaleString("en-US")}
              </td>
              <td className="hidden font-mono text-xs text-text-secondary md:table-cell">
                {token.agentCount.toLocaleString("en-US")}
              </td>
              <td className="hidden md:table-cell">
                <ProtocolIcons protocols={token.protocols} />
              </td>
              <td className="hidden w-24 md:table-cell">
                <Sparkline series={token.series} label={`Seven day observed volume for ${tokenLabel(token)}`} />
              </td>
              <td className="hidden font-mono text-xs text-text-muted md:table-cell">
                {formatAge(token.lastSeenSeconds)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
