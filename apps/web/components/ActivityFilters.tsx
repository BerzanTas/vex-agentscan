"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  ACTIVITY_KIND_FILTERS,
  ACTIVITY_STATUS_FILTERS,
  ACTIVITY_VERIFICATION_FILTERS,
  type ActivityFilters as SelectedActivityFilters,
} from "../lib/api";
import {
  activeActivityFilterCount,
  activityFiltersToQuery,
  withActivityFilter,
  type ActivityFilterName,
} from "../lib/activity-filters";

const ANY_VALUE = "";

export function hasActiveActivityFilter(filters: SelectedActivityFilters): boolean {
  return activeActivityFilterCount(filters) > 0;
}

function optionLabel(value: string): string {
  return value.replace(/_/g, " ");
}

function FilterField({
  name,
  label,
  anyLabel,
  options,
  value,
  onSelect,
}: {
  name: ActivityFilterName;
  label: string;
  anyLabel: string;
  options: readonly string[];
  value: string | undefined;
  onSelect: (name: ActivityFilterName, value: string) => void;
}) {
  const active = value !== undefined && value !== ANY_VALUE;
  return (
    <div className="filter-field" data-active={active ? "true" : undefined}>
      <span className="filter-field-label" aria-hidden="true">
        {label}
      </span>
      <span className="filter-field-control">
        <select
          className="filter-field-select"
          aria-label={label}
          value={value ?? ANY_VALUE}
          onChange={(event) => onSelect(name, event.target.value)}
        >
          <option value={ANY_VALUE}>{anyLabel}</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {optionLabel(option)}
            </option>
          ))}
        </select>
      </span>
    </div>
  );
}

export function ActivityFilters({
  filters,
  protocols,
  chains,
}: {
  filters: SelectedActivityFilters;
  protocols: readonly string[];
  chains: readonly string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const activeFilterCount = activeActivityFilterCount(filters);

  const show = (next: SelectedActivityFilters) => {
    const query = activityFiltersToQuery(next);
    router.replace(query === "" ? pathname : `${pathname}?${query}`);
  };

  const selectFilter = (name: ActivityFilterName, value: string) => {
    show(withActivityFilter(filters, name, value));
  };

  return (
    <div className="glass filter-console" role="group" aria-label="Activity filters">
      <FilterField
        name="kind"
        label="Kind"
        anyLabel="All kinds"
        options={ACTIVITY_KIND_FILTERS}
        value={filters.kind}
        onSelect={selectFilter}
      />
      <FilterField
        name="protocol"
        label="Protocol"
        anyLabel="All protocols"
        options={protocols}
        value={filters.protocol}
        onSelect={selectFilter}
      />
      <FilterField
        name="chain"
        label="Chain"
        anyLabel="All chains"
        options={chains}
        value={filters.chain}
        onSelect={selectFilter}
      />
      <FilterField
        name="status"
        label="Status"
        anyLabel="All statuses"
        options={ACTIVITY_STATUS_FILTERS}
        value={filters.status}
        onSelect={selectFilter}
      />
      <FilterField
        name="verification"
        label="Verification"
        anyLabel="All verification states"
        options={ACTIVITY_VERIFICATION_FILTERS}
        value={filters.verification}
        onSelect={selectFilter}
      />
      <button
        type="button"
        className="filter-clear-chip"
        disabled={activeFilterCount === 0}
        onClick={() => show({})}
      >
        {activeFilterCount === 0 ? "Clear filters" : `Clear filters (${activeFilterCount})`}
      </button>
    </div>
  );
}
