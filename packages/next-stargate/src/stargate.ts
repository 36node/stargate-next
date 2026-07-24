import type { CryptoKey as JoseCryptoKey } from "jose";
import { importSPKI, jwtVerify } from "jose";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cache } from "react";

import {
  CookieOptions,
  clearSessionCookies,
  getRefreshTokenFromCookie,
  getSessionTokenFromCookie,
  RefreshTokenCookieKey,
  setSessionCookies,
  TokenCookieKey,
} from "./cookie";
import { findProviderByPathname, safeParseState } from "./helper";
import type {
  AuthService,
  JwtVerifyConfig,
  Provider,
  Session,
  SessionWithToken,
  SignInCredential,
  SignInParams,
  SignInState,
  TokenPayload,
} from "./types";

type ResolvedKey = { key: JoseCryptoKey | Uint8Array; algorithms: string[] };

async function resolveVerifyKey(config: JwtVerifyConfig): Promise<ResolvedKey> {
  switch (config.algorithm) {
    case "HS256":
      return {
        key: new TextEncoder().encode(config.secret),
        algorithms: ["HS256"],
      };
    case "RS256":
    case "ES256":
      return {
        key: await importSPKI(config.publicKey, config.algorithm),
        algorithms: [config.algorithm],
      };
    default:
      throw new Error(
        `Unsupported JWT algorithm: ${(config as { algorithm: string }).algorithm}`
      );
  }
}

export type StargateConfig = {
  auth: AuthService;
  cookieSecure?: boolean;
  jwt: JwtVerifyConfig;
  pages: {
    login: string;
    loginRedirect: string;
    bindRedirect?: string;
  };
  providers?: Provider[];
};

export function NextStargate({
  auth,
  cookieSecure,
  jwt,
  pages,
  providers,
}: StargateConfig) {
  const verifyKeyPromise = resolveVerifyKey(jwt);

  async function verifyToken(token: string): Promise<TokenPayload> {
    const { key, algorithms } = await verifyKeyPromise;
    const res = await jwtVerify(token, key, { algorithms });
    return res.payload as TokenPayload;
  }

  async function signInWithCredentials(
    { login, password }: SignInCredential,
    state?: SignInState
  ) {
    const res = await auth.login({
      body: { login, password },
    });
    await setSessionCookies(res.data, cookieSecure, Boolean(state?.rememberMe));
    const redirectUrl = state?.from ?? pages.loginRedirect;
    redirect(redirectUrl);
  }

  async function resolveCallbackUrl(callbackUrl: string): Promise<string> {
    if (!callbackUrl.startsWith("/")) {
      return callbackUrl;
    }
    const h = await headers();
    const host = h.get("host") ?? "localhost:3000";
    const proto = h.get("x-forwarded-proto") ?? "http";
    return `${proto}://${host}${callbackUrl}`;
  }

  async function signInWithOAuth(provider: string, state?: SignInState) {
    const providerConfig = providers?.find((p) => p.name === provider);
    if (!providerConfig) {
      throw new Error(`[signInWithOAuth] provider ${provider} not found`);
    }

    const redirectUri = await resolveCallbackUrl(providerConfig.callbackUrl);
    const { data: authorizer } = await auth.getAuthorizer({
      query: {
        provider,
        redirectUri,
        responseType: providerConfig.responseType,
        state: state ? encodeURIComponent(JSON.stringify(state)) : undefined,
      },
    });

    redirect(authorizer.url);
  }

  function signIn(params: SignInParams, state?: SignInState): Promise<void> {
    if (typeof params === "string") {
      return signInWithOAuth(params, state);
    }

    return signInWithCredentials(params, state);
  }

  async function loadSessionFromHeader(): Promise<Session | undefined> {
    const headersList = await headers();

    const authHeader = headersList.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const payload = await verifyToken(authHeader.substring(7));
        return {
          id: payload.sid,
          subject: payload.sub,
          source: payload.source,
          ns: payload.ns,
          permissions: payload.permissions,
          type: payload.type,
          roles: payload.roles,
        };
      } catch {
        // Bearer token verification failed, try other methods
      }
    }

    const apiKey = headersList.get("x-api-key");
    if (apiKey) {
      const { data: session } = await auth.getSessionByKey({
        path: { key: apiKey },
      });
      return session;
    }

    return;
  }

  async function loadSessionFromCookie(): Promise<Session | undefined> {
    const token = await getSessionTokenFromCookie();
    if (!token) {
      return;
    }

    const payload = await verifyToken(token);
    return {
      id: payload.sid,
      subject: payload.sub,
      source: payload.source,
      ns: payload.ns,
      permissions: payload.permissions,
      type: payload.type,
      roles: payload.roles,
    };
  }

  async function loadSession(
    response?: NextResponse
  ): Promise<Session | undefined> {
    let session: Session | undefined;

    try {
      session = await loadSessionFromHeader();

      if (!session) {
        session = await loadSessionFromCookie();
      }

      if (!session) {
        session = await refreshSession(response);
      }
    } catch {
      return;
    }

    return session;
  }

  async function refreshSession(
    response?: NextResponse
  ): Promise<SessionWithToken | undefined> {
    const refreshToken = await getRefreshTokenFromCookie();
    if (!refreshToken) {
      return;
    }

    const res = await auth.refresh({
      body: { refreshToken },
    });

    if (response) {
      response.cookies.set(TokenCookieKey, res.data.token, {
        secure: cookieSecure,
        expires: res.data.tokenExpireAt,
        ...CookieOptions,
      });
      response.cookies.set(RefreshTokenCookieKey, res.data.key, {
        secure: cookieSecure,
        expires: res.data.expireAt,
        ...CookieOptions,
      });
    }

    return res.data;
  }

  async function signOut() {
    const session = await loadSession();
    if (!session) {
      return;
    }
    await auth.logout({ body: { sid: session.id } });
    await clearSessionCookies();
    redirect(pages.login);
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: OAuth callback handling
  async function handleAuthCallback(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = safeParseState(searchParams.get("state"));
    const origin = req.nextUrl.origin;
    const loginUrl = new URL(pages.login, origin);

    if (!code) {
      return NextResponse.redirect(loginUrl);
    }

    const provider = findProviderByPathname(
      providers || [],
      req.nextUrl.pathname
    );
    if (!provider) {
      loginUrl.searchParams.set(
        "msg",
        `No provider match pathname: ${req.nextUrl.pathname}`
      );
      return NextResponse.redirect(loginUrl);
    }

    let session: SessionWithToken | undefined;
    try {
      const redirectUri = provider.callbackUrl.startsWith("/")
        ? `${origin}${provider.callbackUrl}`
        : provider.callbackUrl;
      const loginByOAuthRes = await auth.loginByOAuth({
        body: {
          provider: provider.name,
          code,
          redirectUri,
          grantType: provider.grantType,
        },
      });
      session = loginByOAuthRes.data;
      if (!session) {
        throw new Error("No response from auth service");
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        loginUrl.searchParams.set(
          "msg",
          `[Auth Response Error] ${error.message}`
        );
      }
      return NextResponse.redirect(loginUrl);
    }

    await setSessionCookies(session, cookieSecure);

    let redirectTo: URL;
    if (session.source && pages.bindRedirect) {
      redirectTo = new URL(pages.bindRedirect, origin);
      if (state?.from) {
        redirectTo.searchParams.set("from", state.from);
      }
    } else {
      redirectTo = state?.from
        ? new URL(state.from, origin)
        : new URL(pages.loginRedirect, origin);
    }

    return NextResponse.redirect(redirectTo);
  }

  async function ensureSession() {
    const session = await loadSession();
    if (!session) {
      redirect(pages.login);
    }
    return session;
  }

  async function getLoginUserId() {
    const session = await ensureSession();
    if (session.source) {
      return redirect(pages.bindRedirect || pages.login);
    }
    return session.subject;
  }

  return {
    signIn,
    signOut,
    loadSession: cache ? cache(loadSession) : loadSession,
    handleAuthCallback,
    ensureSession,
    getLoginUserId,
  };
}
