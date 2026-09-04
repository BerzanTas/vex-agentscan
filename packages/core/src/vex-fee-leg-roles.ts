/**
 * The Vex integrator fee is a SEPARATE on-chain transaction, but it is part of the ACTION it
 * charges for and never a second entry on this site (owner decision 2026-09-04).
 *
 * The producer writes the fee as a child leg of the execution it belongs to: the same
 * `source_execution_id`, `event_index` 1 beside the action's own row at 0, under one of the roles
 * below. Every public count, list and lookup therefore treats a fee-role row as execution
 * plumbing, and the parent row carries the charge through the `vexFee` projection instead.
 *
 * The set is a NEGATIVE list rather than a positive allow-list of user-facing roles, because the
 * feed deliberately shows every non-fee leg an execution produces (both bridge legs, both Pendle
 * legs). `vex-fee-leg-roles.test.ts` gives every role of the contract vocabulary a verdict against
 * this set, so a role added to the contract without a decision here fails that test rather than
 * quietly becoming a fee - or quietly becoming a row.
 */
export const VEX_FEE_LEG_ROLES: readonly string[] = [
  "swap_fee",
  "bridge_fee",
  "trench_fee",
  "pools_fee",
];

export function isVexFeeLegRole(eventRole: string): boolean {
  return VEX_FEE_LEG_ROLES.includes(eventRole);
}

/** SQL: the column names a fee leg. */
export function vexFeeLegRolesIn(eventRoleColumn: string): string {
  const literals = VEX_FEE_LEG_ROLES.map((role) => `'${role}'`).join(",");
  return `${eventRoleColumn} IN (${literals})`;
}

/** SQL: the row is a logical entry - an action of its own, not the fee leg of one. */
export function logicalRowIn(eventRoleColumn: string): string {
  return `${eventRoleColumn} NOT IN (${VEX_FEE_LEG_ROLES.map((role) => `'${role}'`).join(",")})`;
}
