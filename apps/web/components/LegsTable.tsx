import type { TxDetailDto } from "../lib/api";
import { formatRawAmount, formatUsdEstimate } from "../lib/format";

type Leg = {
  label: string;
  symbol: string | null;
  decimals: number | null;
  requestedRaw: string | null;
  executedRaw: string | null;
  usdEst: string | null;
};

function legsFrom(detail: TxDetailDto): Leg[] {
  return [
    {
      label: "In",
      symbol: detail.tokenInSymbol,
      decimals: detail.tokenInDecimals,
      requestedRaw: detail.amountInRaw,
      executedRaw: detail.executedInRaw,
      usdEst: detail.usdInEst,
    },
    {
      label: "Out",
      symbol: detail.tokenOutSymbol,
      decimals: detail.tokenOutDecimals,
      requestedRaw: null,
      executedRaw: detail.executedOutRaw,
      usdEst: detail.usdOutEst,
    },
  ];
}

function AmountCell({
  raw,
  decimals,
  symbol,
  estimate,
}: {
  raw: string | null;
  decimals: number | null;
  symbol: string | null;
  estimate: boolean;
}) {
  if (raw === null || decimals === null) {
    return <span className="text-text-muted">—</span>;
  }
  return (
    <span className="font-mono">
      {formatRawAmount(raw, decimals)}
      {symbol !== null && <span className="ml-1 text-text-muted">{symbol}</span>}
      {estimate && <span className="ml-1 text-xs text-text-muted">est.</span>}
    </span>
  );
}

function UsdCell({ usd }: { usd: string | null }) {
  if (usd === null) {
    return <span className="text-text-muted">—</span>;
  }
  return (
    <span className="font-mono text-text-secondary">
      ${formatUsdEstimate(usd)}
      <span className="ml-1 text-xs text-text-muted">est.</span>
    </span>
  );
}

export function LegsTable({ detail }: { detail: TxDetailDto }) {
  const settled = detail.status === "confirmed";
  return (
    <div className="overflow-x-auto rounded-lg border border-bg-overlay bg-bg-elevated">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-bg-overlay text-xs text-text-muted">
            <th className="px-4 py-3 font-normal">Leg</th>
            <th className="px-4 py-3 font-normal">Token</th>
            <th className="px-4 py-3 font-normal">Requested</th>
            <th className="px-4 py-3 font-normal">Executed</th>
            <th className="px-4 py-3 font-normal">USD</th>
          </tr>
        </thead>
        <tbody>
          {legsFrom(detail).map((leg) => (
            <tr key={leg.label} className="border-b border-bg-overlay/60 last:border-b-0">
              <td className="px-4 py-3 text-text-secondary">{leg.label}</td>
              <td className="px-4 py-3 text-text-primary">{leg.symbol ?? "—"}</td>
              <td className="px-4 py-3">
                <AmountCell raw={leg.requestedRaw} decimals={leg.decimals} symbol={leg.symbol} estimate />
              </td>
              <td className="px-4 py-3">
                <AmountCell
                  raw={leg.executedRaw}
                  decimals={leg.decimals}
                  symbol={leg.symbol}
                  estimate={!settled}
                />
              </td>
              <td className="px-4 py-3">
                <UsdCell usd={leg.usdEst} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
