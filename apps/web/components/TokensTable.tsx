import Link from "next/link";
import type { TokenStatDto } from "../lib/api";
import { formatAge, formatUsdCompact, formatUsdEstimate } from "../lib/format";
import { ChainBadge } from "./ChainBadge";
import { EmptyPanel } from "./EmptyPanel";
import { ProtocolBadge } from "./ProtocolBadge";
import { Sparkline } from "./Sparkline";

const ADDRESS_HEAD_LENGTH = 6;
const ADDRESS_TAIL_LENGTH = 4;
const MAX_PROTOCOL_ICONS = 3;

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
          <tr>
            <th className="table-head font-normal">#</th>
            <th className="table-head font-normal">Token</th>
            <th className="table-head font-normal">Observed volume</th>
            <th className="table-head font-normal">Txns</th>
            <th className="table-head font-normal">Agents</th>
            <th className="table-head font-normal">Protocols</th>
            <th className="table-head font-normal">7d</th>
            <th className="table-head font-normal">Last seen</th>
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
                title={`$${formatUsdEstimate(token.volumeUsd)}`}
              >
                ${formatUsdCompact(token.volumeUsd)}
                <span className="ml-1 text-xs text-text-muted">est.</span>
              </td>
              <td className="font-mono text-xs text-text-secondary">
                {token.txCount.toLocaleString("en-US")}
              </td>
              <td className="font-mono text-xs text-text-secondary">
                {token.agentCount.toLocaleString("en-US")}
              </td>
              <td>
                <ProtocolIcons protocols={token.protocols} />
              </td>
              <td className="w-24">
                <Sparkline series={token.series} label={`Seven day observed volume for ${tokenLabel(token)}`} />
              </td>
              <td className="font-mono text-xs text-text-muted">
                {formatAge(token.lastSeenSeconds)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
