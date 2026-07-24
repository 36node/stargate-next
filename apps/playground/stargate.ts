"use server";

import type { JwtVerifyConfig } from "@repo/next-stargate";
import { NextStargate } from "@repo/next-stargate";
import { auth } from "@repo/services/auth/client";
import { env } from "@repo/services/env";

const pages = {
  login: "/sign-in",
  loginRedirect: "/",
};

function resolveJwt(): JwtVerifyConfig {
  if (env.STARGATE_JWT_PUBLIC_KEY) {
    return {
      algorithm: "RS256",
      publicKey: env.STARGATE_JWT_PUBLIC_KEY.replace(/\\n/g, "\n"),
    };
  }

  return { algorithm: "HS256", secret: env.STARGATE_JWT_SECRET };
}

export const { ensureSession, loadSession, signIn, signOut } = NextStargate({
  auth,
  cookieSecure: process.env.NODE_ENV === "production",
  jwt: resolveJwt(),
  pages,
});
