export const ADMIN_ROLES = ["owner", "operator", "marketing", "analyst"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const OPERATOR_ROLES = ["owner", "operator"] as const;
export const OWNER_ROLES = ["owner"] as const;
export const MARKETING_ROLES = ["owner", "operator", "marketing"] as const;
export const ANALYST_ROLES = ["owner", "operator", "analyst"] as const;

const PATH_ROLES: Array<{ prefix: string; roles: readonly AdminRole[] }> = [
  { prefix: "/dashboard/analytics", roles: ANALYST_ROLES },
  { prefix: "/dashboard/audit-logs", roles: ANALYST_ROLES },
  { prefix: "/dashboard/users", roles: OPERATOR_ROLES },
  { prefix: "/dashboard/moderators", roles: OPERATOR_ROLES },
  { prefix: "/dashboard/moderation", roles: OPERATOR_ROLES },
  { prefix: "/dashboard/discussions", roles: OPERATOR_ROLES },
  { prefix: "/dashboard/seed-hubs", roles: OPERATOR_ROLES },
  { prefix: "/dashboard/groups", roles: OPERATOR_ROLES },
  { prefix: "/dashboard/notifications", roles: MARKETING_ROLES },
  { prefix: "/dashboard/blog", roles: MARKETING_ROLES },
  { prefix: "/dashboard", roles: ADMIN_ROLES },
];

export function hasAdminRole(role: AdminRole, allowed: readonly AdminRole[]): boolean {
  return allowed.includes(role);
}

export function allowedRolesForPath(pathname: string): readonly AdminRole[] {
  const match = PATH_ROLES.find(
    ({ prefix }) => pathname === prefix || (prefix !== "/dashboard" && pathname.startsWith(`${prefix}/`))
  );
  return match?.roles ?? OPERATOR_ROLES;
}
