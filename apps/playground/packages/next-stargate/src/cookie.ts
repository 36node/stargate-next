import { cookies } from "next/headers";

import type { SessionWithToken } from "./types";

export const RefreshTokenCookieKey = "s-refresh";
export const TokenCookieKey = "s-token";
export const CookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
};

export type SessionCookieNames = {
  refresh: string;
  tenant?: string;
  token: string;
};

export const defaultSessionCookieNames: SessionCookieNames = {
  refresh: RefreshTokenCookieKey,
  token: TokenCookieKey,
};

async function setSessionTokenCookie(
  token: string,
  tokenExpireAt: Date,
  secure?: boolean,
  cookieName = TokenCookieKey
): Promise<void> {
  (await cookies()).set(cookieName, token, {
    secure,
    expires: tokenExpireAt,
    ...CookieOptions,
  });
}

async function getSessionTokenFromCookie(cookieName = TokenCookieKey) {
  return (await cookies()).get(cookieName)?.value;
}

async function getRefreshTokenFromCookie(cookieName = RefreshTokenCookieKey) {
  return (await cookies()).get(cookieName)?.value;
}

async function getTenantFromCookie(cookieName?: string) {
  return cookieName ? (await cookies()).get(cookieName)?.value : undefined;
}

async function setTenantCookie(
  tenantId: string,
  expireAt: Date,
  secure?: boolean,
  cookieName?: string
): Promise<void> {
  if (!cookieName) {
    return;
  }
  (await cookies()).set(cookieName, tenantId, {
    secure,
    expires: expireAt,
    ...CookieOptions,
  });
}

async function setRefreshTokenCookie(
  refreshToken: string,
  refreshTokenExpireAt: Date,
  secure?: boolean,
  cookieName = RefreshTokenCookieKey
): Promise<void> {
  (await cookies()).set(cookieName, refreshToken, {
    secure,
    expires: refreshTokenExpireAt,
    ...CookieOptions,
  });
}

async function clearSessionCookies(
  cookieNames: SessionCookieNames = defaultSessionCookieNames
) {
  const cookieStore = await cookies();
  cookieStore.delete(cookieNames.token);
  cookieStore.delete(cookieNames.refresh);
}

async function setSessionCookies(
  session: SessionWithToken,
  secure?: boolean,
  rememberMe?: boolean,
  cookieNames: SessionCookieNames = defaultSessionCookieNames
) {
  const keepalive = rememberMe ?? true;
  await setSessionTokenCookie(
    session.token,
    session.tokenExpireAt,
    secure,
    cookieNames.token
  );
  await setRefreshTokenCookie(
    session.key,
    keepalive ? session.expireAt : session.tokenExpireAt,
    secure,
    cookieNames.refresh
  );
  if (session.tenantId) {
    await setTenantCookie(
      session.tenantId,
      keepalive ? session.expireAt : session.tokenExpireAt,
      secure,
      cookieNames.tenant
    );
  }
}

export {
  setSessionTokenCookie,
  getSessionTokenFromCookie,
  getRefreshTokenFromCookie,
  getTenantFromCookie,
  clearSessionCookies,
  setSessionCookies,
  setTenantCookie,
};
