import { jwtVerify, SignJWT } from "jose";
import { redirect } from "next/navigation";
import type { NextRequest, NextResponse } from "next/server";
import { NextResponse as ResponseFactory } from "next/server";
import { cache } from "react";

import {
  clearSessionCookies,
  getSessionTokenFromCookie,
  setSessionTokenCookie,
} from "./cookie";
import type { Session, SignInParams, SignInState } from "./types";

const LocalAuthContext = "cyclops-local-auth-v1";
const DefaultSessionTTLSeconds = 60 * 60 * 24 * 7;

type ErrorWithCode = Error & { code: string };

type LocalAuthSession = {
  subject: string;
  ns?: string;
  type?: string;
  permissions?: string[];
  roles?: string[];
  groups?: string[];
};

export type LocalAuthConfig = {
  username: string;
  password: string;
  cookieSecure?: boolean;
  session: LocalAuthSession;
  sessionTTLSeconds?: number;
  pages: {
    login: string;
    loginRedirect: string;
  };
};

async function deriveSecret(username: string, password: string) {
  const data = new TextEncoder().encode(
    `${username}\0${password}\0${LocalAuthContext}`
  );
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

function createAuthFailedError(): ErrorWithCode {
  const error = new Error("AUTH_FAILED") as ErrorWithCode;
  error.code = "AUTH_FAILED";
  return error;
}

function getStringArrayClaim(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return;
  }
  return value.filter((item): item is string => typeof item === "string");
}

function toSession(payload: {
  sid?: unknown;
  sub?: unknown;
  ns?: unknown;
  type?: unknown;
  permissions?: unknown;
  roles?: unknown;
  groups?: unknown;
}): Session | undefined {
  if (typeof payload.sid !== "string" || typeof payload.sub !== "string") {
    return;
  }

  return {
    id: payload.sid,
    subject: payload.sub,
    ns: typeof payload.ns === "string" ? payload.ns : undefined,
    type: typeof payload.type === "string" ? payload.type : undefined,
    permissions: getStringArrayClaim(payload.permissions),
    roles: getStringArrayClaim(payload.roles),
    groups: getStringArrayClaim(payload.groups) ?? [],
  };
}

export function NextLocalAuth({
  username,
  password,
  cookieSecure,
  session,
  sessionTTLSeconds = DefaultSessionTTLSeconds,
  pages,
}: LocalAuthConfig) {
  const keyPromise = deriveSecret(username, password);

  async function signIn(params: SignInParams, state?: SignInState) {
    if (typeof params === "string") {
      throw new Error("本地认证模式不支持第三方登录");
    }

    if (params.login !== username || params.password !== password) {
      throw createAuthFailedError();
    }

    const now = Math.floor(Date.now() / 1000);
    const expireAt = now + sessionTTLSeconds;
    const token = await new SignJWT({
      sid: crypto.randomUUID(),
      ns: session.ns,
      type: session.type,
      permissions: session.permissions,
      roles: session.roles,
      groups: session.groups ?? [],
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(session.subject)
      .setIssuedAt(now)
      .setExpirationTime(expireAt)
      .sign(await keyPromise);

    await setSessionTokenCookie(token, new Date(expireAt * 1000), cookieSecure);

    redirect(state?.from ?? pages.loginRedirect);
  }

  async function loadSession(
    _response?: NextResponse
  ): Promise<Session | undefined> {
    const token = await getSessionTokenFromCookie();
    if (!token) {
      return;
    }

    try {
      const { payload } = await jwtVerify(token, await keyPromise, {
        algorithms: ["HS256"],
      });
      return toSession(payload);
    } catch {
      return;
    }
  }

  async function signOut() {
    await clearSessionCookies();
    redirect(pages.login);
  }

  async function ensureSession() {
    const currentSession = await loadSession();
    if (!currentSession) {
      redirect(pages.login);
    }
    return currentSession;
  }

  async function getLoginUserId() {
    const currentSession = await ensureSession();
    return currentSession.subject;
  }

  // biome-ignore lint/suspicious/useAwait: Keep auth callback signature aligned with NextStargate.
  async function handleAuthCallback(req: NextRequest) {
    return ResponseFactory.redirect(new URL(pages.login, req.nextUrl.origin));
  }

  return {
    signIn,
    signOut,
    loadSession: cache(loadSession),
    handleAuthCallback,
    ensureSession,
    getLoginUserId,
  };
}
