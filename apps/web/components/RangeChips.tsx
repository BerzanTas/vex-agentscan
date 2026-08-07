"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ChartRange } from "../lib/api";

const RANGE_LABELS: { range: ChartRange; label: string }[] = [
  { range: "24h", label: "24H" },
  { range: "7d", label: "7D" },
  { range: "30d", label: "30D" },
  { range: "all", label: "ALL" },
];

export function RangeChips({ current, label }: { current: ChartRange; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const showRange = (range: ChartRange) => {
    if (range === current) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set("range", range);
    router.replace(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="chart-chip-group" role="group" aria-label={label}>
      {RANGE_LABELS.map((chip) => (
        <button
          key={chip.range}
          type="button"
          aria-pressed={chip.range === current}
          className={chip.range === current ? "chart-chip chart-chip-active" : "chart-chip"}
          onClick={() => showRange(chip.range)}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
