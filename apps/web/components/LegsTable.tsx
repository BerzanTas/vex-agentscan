import type { TxDetailDto } from "../lib/api";
import { formatRawAmount, formatRawAmountDisplay, formatUsdAmount } from "../lib/format";

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
    // The SECOND output leg, for the settlements that pay two assets in one transaction: a Pendle
    // split mints PT and YT, and a launchpad creator-fee or holder-reward claim pays the launched
    // token AND the asset it was paired against. Showing one half of a two-asset settlement as if
    // it were the whole of it understates what the agent received, so the row appears whenever the
    // ledger holds it - and is omitted entirely when it does not, rather than printing an empty
    // leg on every ordinary swap.
    ...(detail.tokenOut2Symbol === null && detail.amountOut2Raw === null && detail.executedOut2Raw === null
      ? []
      : [
          {
            label: "Out 2",
            symbol: detail.tokenOut2Symbol,
            decimals: detail.tokenOut2Decimals,
            requestedRaw: detail.amountOut2Raw,
            executedRaw: detail.executedOut2Raw,
            usdEst: null,
          },
        ]),
  ];
}

function AmountStack({
  raw,
  decimals,
  symbol,
  usdEst,
  missingCaption,
}: {
  raw: string | null;
  decimals: number | null;
  symbol: string | null;
  usdEst: string | null;
  missingCaption: string | null;
}) {
  const hasAmount = raw !== null && decimals !== null;
  return (
    <div className="flex flex-col gap-0.5">
      {hasAmount ? (
        <span className="font-mono text-text-primary">
          <span title={formatRawAmount(raw, decimals)}>{formatRawAmountDisplay(raw, decimals)}</span>
          {symbol !== null && <span className="ml-1 text-text-muted">{symbol}</span>}
        </span>
      ) : (
        <span className="text-text-muted">—</span>
      )}
      {usdEst !== null && (
        <span className="font-mono text-xs text-text-muted">${formatUsdAmount(usdEst)} est.</span>
      )}
      {!hasAmount && missingCaption !== null && (
        <span className="text-xs text-text-muted">{missingCaption}</span>
      )}
    </div>
  );
}

export function LegsTable({ detail }: { detail: TxDetailDto }) {
  return (
    <div className="glass overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-bg-overlay text-xs text-text-muted">
            <th className="px-4 py-3 font-normal">Leg</th>
            <th className="px-4 py-3 font-normal">Requested</th>
            <th className="px-4 py-3 font-normal">Executed</th>
          </tr>
        </thead>
        <tbody>
          {legsFrom(detail).map((leg) => (
            <tr key={leg.label} className="border-b border-bg-overlay/60 last:border-b-0">
              <td className="px-4 py-3 align-top text-text-secondary">
                {leg.label}
                {leg.symbol !== null && (
                  <span className="ml-2 font-mono text-xs text-text-primary">{leg.symbol}</span>
                )}
              </td>
              <td className="px-4 py-3 align-top">
                <AmountStack
                  raw={leg.requestedRaw}
                  decimals={leg.decimals}
                  symbol={leg.symbol}
                  usdEst={leg.usdEst}
                  missingCaption={null}
                />
              </td>
              <td className="px-4 py-3 align-top">
                <AmountStack
                  raw={leg.executedRaw}
                  decimals={leg.decimals}
                  symbol={leg.symbol}
                  usdEst={null}
                  missingCaption="not settled"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
