import { type NextRequest, NextResponse } from "next/server";

import { sessionCookieNames } from "./auth-config";
import { loadSession } from "./stargate";

// 所有受保护页面都必须经过 proxy；认证加载路径的 Cookie 只在这里写入。
// ensureSession 仅作纵深防御；sign-in/sign-out 的 Server Action 不受此约束。
const publicPaths = ["/api/captcha", "/sign-in", "/health"];

function isPublicPath(pathname: string): boolean {
  return publicPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export function carryOverCookies(
  target: NextResponse,
  source: NextResponse
): void {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
}

export async function proxy(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const session = await loadSession(response);

  if (session) {
    return response;
  }

  const loginUrl = new URL("/sign-in", request.url);
  loginUrl.searchParams.set("from", request.nextUrl.pathname);
  const redirectResponse = NextResponse.redirect(loginUrl);
  carryOverCookies(redirectResponse, response);
  redirectResponse.cookies.delete(sessionCookieNames.token);
  redirectResponse.cookies.delete(sessionCookieNames.refresh);
  return redirectResponse;
}

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:css|js|jpe?g|png|svg|ico)).*)"],
};
