/** proxy 最终响应的 Cookie 传递、清理与 matcher 回归。 */
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { hasCookieDeletionSemantics } from "./cookie-test-utils";

const mocks = vi.hoisted(() => ({ loadSession: vi.fn() }));

vi.mock("./stargate", () => ({ loadSession: mocks.loadSession }));

import { carryOverCookies, config, proxy } from "./proxy";

function request(pathname: string) {
  return new NextRequest(`http://localhost${pathname}`);
}

function cookieNames(response: NextResponse): string[] {
  return response.headers
    .getSetCookie()
    .map((header) => header.slice(0, header.indexOf("=")));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("playground proxy", () => {
  it("allows public paths without loading a session", async () => {
    for (const pathname of ["/sign-in", "/api/captcha", "/health"]) {
      const response = await proxy(request(pathname));
      expect(response.status).toBe(200);
    }
    expect(mocks.loadSession).not.toHaveBeenCalled();
  });

  it("returns refresh cookies on the successful protected response", async () => {
    mocks.loadSession.mockImplementation((sourceResponse: NextResponse) => {
      sourceResponse.cookies.set("s-next-token", "token-new");
      sourceResponse.cookies.set("s-next-refresh", "refresh-new");
      return Promise.resolve({ id: "session-1" });
    });

    const response = await proxy(request("/dashboard"));
    expect(response.status).toBe(200);
    expect(response.cookies.get("s-next-token")?.value).toBe("token-new");
    expect(response.cookies.get("s-next-refresh")?.value).toBe("refresh-new");
  });

  it("carries a backfilled default tenant cookie to the protected response", async () => {
    mocks.loadSession.mockImplementation((sourceResponse: NextResponse) => {
      sourceResponse.cookies.set("s-next-tenant", "default");
      return Promise.resolve({ id: "legacy-session", tenantId: "default" });
    });

    const response = await proxy(request("/dashboard"));
    expect(response.status).toBe(200);
    expect(response.cookies.get("s-next-tenant")?.value).toBe("default");
  });

  it("redirects and returns exactly one deletion for each session cookie", async () => {
    mocks.loadSession.mockImplementation((sourceResponse: NextResponse) => {
      sourceResponse.cookies.delete("s-next-token");
      sourceResponse.cookies.delete("s-next-refresh");
      sourceResponse.cookies.set("s-next-tenant", "default");
      return Promise.resolve();
    });

    const response = await proxy(request("/dashboard"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/sign-in?from=%2Fdashboard"
    );
    expect(cookieNames(response).sort()).toEqual([
      "s-next-refresh",
      "s-next-tenant",
      "s-next-token",
    ]);
    for (const header of response.headers.getSetCookie()) {
      if (header.startsWith("s-next-tenant=")) {
        expect(hasCookieDeletionSemantics(header)).toBe(false);
      } else {
        expect(hasCookieDeletionSemantics(header)).toBe(true);
      }
    }
  });

  it("deletes both cookies even when session loading made no mutations", async () => {
    mocks.loadSession.mockResolvedValue(undefined);

    const response = await proxy(request("/dashboard/detail"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/sign-in?from=%2Fdashboard%2Fdetail"
    );
    expect(cookieNames(response).sort()).toEqual([
      "s-next-refresh",
      "s-next-token",
    ]);
    for (const header of response.headers.getSetCookie()) {
      expect(hasCookieDeletionSemantics(header)).toBe(true);
    }
  });

  it("removes stale session values when deletion headers are applied", async () => {
    mocks.loadSession.mockResolvedValue(undefined);
    const jar = new Map([
      ["s-next-token", "stale-token"],
      ["s-next-refresh", "stale-refresh"],
    ]);
    const response = await proxy(request("/dashboard"));
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(";", 1)[0] ?? "";
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value === "") {
        jar.delete(name);
      } else {
        jar.set(name, value);
      }
    }
    expect(jar.has("s-next-token")).toBe(false);
    expect(jar.has("s-next-refresh")).toBe(false);

    const publicResponse = await proxy(request("/sign-in"));
    expect(publicResponse.status).toBe(200);
    expect(mocks.loadSession).toHaveBeenCalledTimes(1);
  });

  it("carries every source cookie without replacing unrelated headers", () => {
    const source = NextResponse.next();
    source.cookies.set("first", "one");
    source.cookies.set("second", "two");
    const target = NextResponse.redirect("http://localhost/sign-in");
    target.headers.set("x-test", "preserved");

    carryOverCookies(target, source);
    expect(target.headers.get("x-test")).toBe("preserved");
    expect(cookieNames(target).sort()).toEqual(["first", "second"]);
  });

  it("keeps protected, static, and public matcher classifications stable", () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);
    for (const pathname of [
      "/",
      "/dashboard",
      "/dashboard/detail",
      "/some.page",
    ]) {
      expect(matcher.test(pathname)).toBe(true);
    }
    for (const pathname of ["/_next/static/x.js", "/logo.svg", "/app.css"]) {
      expect(matcher.test(pathname)).toBe(false);
    }
    for (const pathname of ["/sign-in", "/api/captcha", "/health"]) {
      expect(matcher.test(pathname)).toBe(true);
    }
  });
});
