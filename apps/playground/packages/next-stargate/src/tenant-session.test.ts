/** Playground Tenant Cookie 与 Token 归一化、拒绝和 refresh 回归。 */
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const cookieValues = new Map<string, string>();
  return {
    cookieValues,
    jwtVerify: vi.fn(),
  };
});

vi.mock("jose", () => ({
  importSPKI: vi.fn(),
  jwtVerify: mocks.jwtVerify,
}));

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      delete: vi.fn(),
      get: (name: string) => {
        const value = mocks.cookieValues.get(name);
        return value === undefined ? undefined : { name, value };
      },
      set: vi.fn(),
    }),
  headers: () => Promise.resolve(new Headers()),
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("react", () => ({ cache: <T>(value: T) => value }));

import { NextStargate } from "./stargate";
import type { AuthService } from "./types";

const TOKEN_EXPIRES_AT = new Date("2030-01-01T00:00:00.000Z");
const TOKEN_EXP = TOKEN_EXPIRES_AT.getTime() / 1000;

function authService(refresh = vi.fn()): AuthService {
  return {
    getAuthorizer: vi.fn(),
    getSessionByKey: vi.fn(),
    login: vi.fn(),
    loginByOAuth: vi.fn(),
    logout: vi.fn(),
    refresh,
  } as unknown as AuthService;
}

function stargate(auth: AuthService) {
  return NextStargate({
    auth,
    cookieNames: {
      refresh: "s-next-refresh",
      tenant: "s-next-tenant",
      token: "s-next-token",
    },
    jwt: { algorithm: "HS256", secret: "test-secret" },
    pages: { login: "/sign-in", loginRedirect: "/" },
  });
}

function deletedCookieNames(response: NextResponse): string[] {
  return response.headers
    .getSetCookie()
    .filter((header) => header.includes("Expires=Thu, 01 Jan 1970"))
    .map((header) => header.slice(0, header.indexOf("=")))
    .sort();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookieValues.clear();
});

describe("NextStargate tenant sessions", () => {
  it("keeps a legacy five-claim token and backfills the default tenant cookie", async () => {
    mocks.cookieValues.set("s-next-token", "legacy-token");
    mocks.jwtVerify.mockResolvedValue({
      payload: {
        exp: TOKEN_EXP,
        sid: "session-1",
        sub: "account-1",
        type: "access",
      },
    });
    const refresh = vi.fn();
    const response = NextResponse.next();

    await expect(
      stargate(authService(refresh)).loadSession(response)
    ).resolves.toMatchObject({
      id: "session-1",
      subject: "account-1",
      tenantId: "default",
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(response.cookies.get("s-next-tenant")?.value).toBe("default");
    expect(
      response.headers
        .getSetCookie()
        .find((header) => header.startsWith("s-next-tenant="))
    ).toContain("Expires=Tue, 01 Jan 2030 00:00:00 GMT");
  });

  it("backfills a missing tenant cookie for a current default token", async () => {
    mocks.cookieValues.set("s-next-token", "default-token");
    mocks.jwtVerify.mockResolvedValue({
      payload: {
        exp: TOKEN_EXP,
        sid: "session-default",
        sub: "account-default",
        tid: "default",
        type: "access",
      },
    });
    const response = NextResponse.next();

    await expect(
      stargate(authService()).loadSession(response)
    ).resolves.toMatchObject({ tenantId: "default" });
    expect(response.cookies.get("s-next-tenant")?.value).toBe("default");
  });

  it("does not rewrite an already matching default tenant cookie", async () => {
    mocks.cookieValues.set("s-next-token", "default-token");
    mocks.cookieValues.set("s-next-tenant", "default");
    mocks.jwtVerify.mockResolvedValue({
      payload: {
        exp: TOKEN_EXP,
        sid: "session-default",
        sub: "account-default",
        tid: "default",
        type: "access",
      },
    });
    const response = NextResponse.next();

    await expect(
      stargate(authService()).loadSession(response)
    ).resolves.toMatchObject({ tenantId: "default" });
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("treats tenant mismatch as terminal and never falls through to refresh", async () => {
    mocks.cookieValues.set("s-next-token", "test-token");
    mocks.cookieValues.set("s-next-refresh", "default-refresh");
    mocks.cookieValues.set("s-next-tenant", "default");
    mocks.jwtVerify.mockResolvedValue({
      payload: {
        exp: TOKEN_EXP,
        sid: "session-test",
        sub: "account-test",
        tid: "test",
        type: "access",
      },
    });
    const refresh = vi.fn().mockResolvedValue({
      data: {
        id: "would-have-refreshed",
        tenantId: "default",
        token: "would-have-refreshed-token",
      },
    });
    const response = NextResponse.next();

    await expect(
      stargate(authService(refresh)).loadSession(response)
    ).resolves.toBeUndefined();
    expect(refresh).not.toHaveBeenCalled();
    expect(deletedCookieNames(response)).toEqual([
      "s-next-refresh",
      "s-next-token",
    ]);
    expect(response.cookies.get("s-next-tenant")).toBeUndefined();
  });

  it("rejects a non-default token when the tenant cookie is missing", async () => {
    mocks.cookieValues.set("s-next-token", "test-token");
    mocks.cookieValues.set("s-next-refresh", "default-refresh");
    mocks.jwtVerify.mockResolvedValue({
      payload: {
        exp: TOKEN_EXP,
        sid: "session-test",
        sub: "account-test",
        tid: "test",
        type: "access",
      },
    });
    const refresh = vi.fn().mockResolvedValue({
      data: {
        id: "would-have-refreshed",
        tenantId: "default",
        token: "would-have-refreshed-token",
      },
    });
    const response = NextResponse.next();

    await expect(
      stargate(authService(refresh)).loadSession(response)
    ).resolves.toBeUndefined();
    expect(refresh).not.toHaveBeenCalled();
    expect(deletedCookieNames(response)).toEqual([
      "s-next-refresh",
      "s-next-token",
    ]);
    expect(response.cookies.get("s-next-tenant")).toBeUndefined();
  });

  it("keeps a non-default token when the tenant cookie matches", async () => {
    mocks.cookieValues.set("s-next-token", "test-token");
    mocks.cookieValues.set("s-next-tenant", "test");
    mocks.jwtVerify.mockResolvedValue({
      payload: {
        exp: TOKEN_EXP,
        sid: "session-test",
        sub: "account-test",
        tid: "test",
        type: "access",
      },
    });
    const refresh = vi.fn();
    const response = NextResponse.next();

    await expect(
      stargate(authService(refresh)).loadSession(response)
    ).resolves.toMatchObject({ tenantId: "test" });
    expect(refresh).not.toHaveBeenCalled();
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("refreshes only the cookie-selected tenant and writes all three cookies", async () => {
    mocks.cookieValues.set("s-next-refresh", "test-refresh");
    mocks.cookieValues.set("s-next-tenant", "test");
    const refresh = vi.fn().mockResolvedValue({
      data: {
        expireAt: new Date("2030-01-02T00:00:00.000Z"),
        id: "session-test",
        key: "test-refresh-next",
        subject: "account-test",
        tenantId: "test",
        token: "test-access-next",
        tokenExpireAt: new Date("2030-01-01T01:00:00.000Z"),
      },
      request: new Request("http://localhost"),
      response: new Response(),
    });
    const response = NextResponse.next();

    await expect(
      stargate(authService(refresh)).loadSession(response)
    ).resolves.toMatchObject({
      tenantId: "test",
    });
    expect(refresh).toHaveBeenCalledWith({
      body: { refreshToken: "test-refresh", tenantId: "test" },
    });
    expect(response.cookies.get("s-next-token")?.value).toBe(
      "test-access-next"
    );
    expect(response.cookies.get("s-next-refresh")?.value).toBe(
      "test-refresh-next"
    );
    expect(response.cookies.get("s-next-tenant")?.value).toBe("test");
  });
});
