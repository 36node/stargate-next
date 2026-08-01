"use server";

import { StargateNextClient } from "@repo/stargate-next-sdk";

import { resolveClockTolerance, sessionCookieNames } from "@/auth-config";
import type {
  AuthService,
  JwtVerifyConfig,
  SessionWithToken,
} from "@/packages/next-stargate";
import { NextStargate } from "@/packages/next-stargate";
import { auth } from "@/packages/services/auth/client";
import { env } from "@/packages/services/env";

const pages = {
  login: "/sign-in",
  loginRedirect: "/",
};

function resolveJwt(): JwtVerifyConfig {
  const clockToleranceSeconds = resolveClockTolerance(
    env.STARGATE_AUTH_BACKEND,
    env.JWT_CLOCK_TOLERANCE_SECONDS
  );
  if (env.STARGATE_JWT_PUBLIC_KEY) {
    return {
      algorithm: "RS256",
      clockToleranceSeconds,
      publicKey: env.STARGATE_JWT_PUBLIC_KEY.replace(/\\n/g, "\n"),
    };
  }

  return {
    algorithm: "HS256",
    clockToleranceSeconds,
    secret: env.STARGATE_JWT_SECRET,
  };
}

function nextSession(tokens: {
  accessToken: string;
  accessTokenExpiresAt: string;
  accountId: string;
  refreshExpiresAt: string;
  refreshKey: string;
  sessionId: string;
}): SessionWithToken {
  return {
    expireAt: new Date(tokens.refreshExpiresAt),
    id: tokens.sessionId,
    key: tokens.refreshKey,
    subject: tokens.accountId,
    token: tokens.accessToken,
    tokenExpireAt: new Date(tokens.accessTokenExpiresAt),
    type: "access",
  };
}

function resolveAuth(): AuthService {
  if (env.STARGATE_AUTH_BACKEND !== "next") {
    return auth;
  }
  const client = new StargateNextClient(env.STARGATE_ENDPOINT, {
    apiKey: env.STARGATE_API_KEY,
  });
  return {
    ...auth,
    async login({ body }) {
      if (!(body.captchaId && body.captchaCode)) {
        throw new Error("captcha is required for Stargate Next");
      }
      const data = await client.login(
        body.login,
        body.password,
        body.captchaId,
        body.captchaCode
      );
      return {
        data: nextSession(data),
        request: new Request(env.STARGATE_ENDPOINT),
        response: new Response(),
      };
    },
    async logout({ body }) {
      if (body.token) {
        await client.logout(body.token);
      }
    },
    async refresh({ body }) {
      const data = await client.refresh(body.refreshToken);
      return {
        data: nextSession(data),
        request: new Request(env.STARGATE_ENDPOINT),
        response: new Response(),
      };
    },
  };
}

export const { ensureSession, loadSession, signIn, signOut } = NextStargate({
  auth: resolveAuth(),
  cookieNames: sessionCookieNames,
  cookieSecure: process.env.NODE_ENV === "production",
  jwt: resolveJwt(),
  pages,
});
