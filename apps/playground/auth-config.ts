/** 集中管理认证后端派生的 Cookie 名与 JWT 容差。 */
export const STARGATE_AUTH_BACKEND_DEFAULT = "next";
export const nextTenantOptions = ["default", "test"] as const;
export type NextTenantId = (typeof nextTenantOptions)[number];
export const defaultTenantId: NextTenantId = "default";

export function resolveTenantId(value: unknown): NextTenantId {
  return typeof value === "string" &&
    nextTenantOptions.includes(value as NextTenantId)
    ? (value as NextTenantId)
    : defaultTenantId;
}

export function isNextBackend(backend: string | undefined): boolean {
  return (backend ?? STARGATE_AUTH_BACKEND_DEFAULT) === "next";
}

export const nextSessionCookieNames = {
  refresh: "s-next-refresh",
  tenant: "s-next-tenant",
  token: "s-next-token",
} as const;

export const legacySessionCookieNames = {
  refresh: "s-refresh",
  token: "s-token",
} as const;

export function resolveSessionCookieNames(backend: string | undefined): {
  refresh: string;
  tenant?: string;
  token: string;
} {
  return isNextBackend(backend)
    ? nextSessionCookieNames
    : legacySessionCookieNames;
}

export function resolveClockTolerance(
  backend: string | undefined,
  nextTolerance: number
): number {
  return isNextBackend(backend) ? nextTolerance : 0;
}

export const sessionCookieNames = resolveSessionCookieNames(
  process.env.STARGATE_AUTH_BACKEND
);
