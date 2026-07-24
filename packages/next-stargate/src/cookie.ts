import { cookies } from "next/headers";

import type { SessionWithToken } from "./types";

export const RefreshTokenCookieKey = "s-refresh";
export const TokenCookieKey = "s-token";
export const CookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
};

async function setSessionTokenCookie(
  token: string,
  tokenExpireAt: Date,
  secure?: boolean
): Promise<void> {
  (await cookies()).set(TokenCookieKey, token, {
    secure,
    expires: tokenExpireAt,
    ...CookieOptions,
  });
}

async function getSessionTokenFromCookie() {
  return (await cookies()).get(TokenCookieKey)?.value;
}

async function getRefreshTokenFromCookie() {
  return (await cookies()).get(RefreshTokenCookieKey)?.value;
}

async function setRefreshTokenCookie(
  refreshToken: string,
  refreshTokenExpireAt: Date,
  secure?: boolean
): Promise<void> {
  (await cookies()).set(RefreshTokenCookieKey, refreshToken, {
    secure,
    expires: refreshTokenExpireAt,
    ...CookieOptions,
  });
}

async function clearSessionCookies() {
  const cookieStore = await cookies();
  cookieStore.delete(TokenCookieKey);
  cookieStore.delete(RefreshTokenCookieKey);
}

async function setSessionCookies(
  session: SessionWithToken,
  secure?: boolean,
  rememberMe?: boolean
) {
  const keepalive = rememberMe ?? true;
  await setSessionTokenCookie(session.token, session.tokenExpireAt, secure);
  await setRefreshTokenCookie(
    session.key,
    keepalive ? session.expireAt : session.tokenExpireAt,
    secure
  );
}

export {
  setSessionTokenCookie,
  getSessionTokenFromCookie,
  getRefreshTokenFromCookie,
  clearSessionCookies,
  setSessionCookies,
};
