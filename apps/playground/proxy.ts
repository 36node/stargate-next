import { type NextRequest, NextResponse } from "next/server";

import { loadSession } from "./stargate";

const publicPaths = ["/api/captcha", "/sign-in", "/health"];

function isPublicPath(pathname: string): boolean {
  return publicPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
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
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:css|js|jpe?g|png|svg|ico)).*)"],
};
