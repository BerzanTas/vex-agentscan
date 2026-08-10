export const CAPITAL_DEPLOYING_ROLES: readonly string[] = [
  "swap",
  "bridge_deposit",
  "lend_deposit",
  "predict_buy",
];

export function deploysCapitalRole(eventRole: string): boolean {
  return CAPITAL_DEPLOYING_ROLES.includes(eventRole);
}

export function capitalDeployingRolesIn(eventRoleColumn: string): string {
  const literals = CAPITAL_DEPLOYING_ROLES.map((role) => `'${role}'`).join(",");
  return `${eventRoleColumn} IN (${literals})`;
}
