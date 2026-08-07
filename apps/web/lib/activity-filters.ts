import {
  ACTIVITY_KIND_FILTERS,
  ACTIVITY_STATUS_FILTERS,
  ACTIVITY_VERIFICATION_FILTERS,
  type ActivityFilters,
} from "./api";

export const ACTIVITY_FILTER_NAMES = ["kind", "protocol", "chain", "status", "verification"] as const;

export type ActivityFilterName = (typeof ACTIVITY_FILTER_NAMES)[number];

export type ActivitySearchParams = Record<string, string | string[] | undefined>;

function firstValue(raw: string | string[] | undefined): string | undefined {
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

function knownValue<T extends string>(
  raw: string | string[] | undefined,
  allowed: readonly T[],
): T | undefined {
  const value = firstValue(raw);
  if (value === undefined) return undefined;
  return allowed.find((option) => option === value);
}

function openValue(raw: string | string[] | undefined): string | undefined {
  const value = firstValue(raw)?.trim();
  if (value === undefined || value === "") return undefined;
  return value;
}

export function parseActivityFilters(searchParams: ActivitySearchParams): ActivityFilters {
  return {
    kind: knownValue(searchParams.kind, ACTIVITY_KIND_FILTERS),
    protocol: openValue(searchParams.protocol),
    chain: openValue(searchParams.chain),
    status: knownValue(searchParams.status, ACTIVITY_STATUS_FILTERS),
    verification: knownValue(searchParams.verification, ACTIVITY_VERIFICATION_FILTERS),
  };
}

export function activityFiltersToQuery(filters: ActivityFilters): string {
  const query = new URLSearchParams();
  for (const name of ACTIVITY_FILTER_NAMES) {
    const value = filters[name];
    if (value !== undefined && value !== "") query.set(name, value);
  }
  return query.toString();
}

export function withActivityFilter(
  filters: ActivityFilters,
  name: ActivityFilterName,
  value: string,
): ActivityFilters {
  return parseActivityFilters({ ...filters, [name]: value });
}

export function activeActivityFilterCount(filters: ActivityFilters): number {
  return ACTIVITY_FILTER_NAMES.filter((name) => {
    const value = filters[name];
    return value !== undefined && value !== "";
  }).length;
}

function sortedUnique(values: readonly (string | null | undefined)[]): string[] {
  const present = values.filter((value): value is string => value !== null && value !== undefined);
  return [...new Set(present)].sort((left, right) => left.localeCompare(right));
}

export function protocolFilterOptions(
  protocols: readonly { protocol: string }[],
  selected?: string,
): string[] {
  return sortedUnique([...protocols.map((entry) => entry.protocol), selected]);
}

export function chainFilterOptions(
  networks: readonly { chainSlug: string }[],
  selected?: string,
): string[] {
  return sortedUnique([...networks.map((entry) => entry.chainSlug), selected]);
}
