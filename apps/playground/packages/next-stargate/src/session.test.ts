/** Playground 会话加载、刷新与 Cookie 所有权的状态机回归。 */
import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { legacySessionCookieNames } from "../../../auth-config";
import { hasCookieDeletionSemantics } from "../../../cookie-test-utils";
import { defaultSessionCookieNames } from "./cookie";
import { NextStargate } from "./stargate";
import type { AuthService, SessionWithToken } from "./types";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
  headers: mocks.headers,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("react", () => ({ cache: <T>(value: T) => value }));

const SECRET = "playground-session-test-secret";
const cookieValues = new Map<string, string>();
const cookieStore = {
  delete: vi.fn((name: string) => cookieValues.delete(name)),
  get: vi.fn((name: string) => {
    const value = cookieValues.get(name);
    return value === undefined ? undefined : { name, value };
  }),
  set: vi.fn((name: string, value: string) => cookieValues.set(name, value)),
};

function session(overrides: Partial<SessionWithToken> = {}): SessionWithToken {
  return {
    expireAt: new Date(Date.now() + 3_600_000),
    id: "session-1",
    key: "refresh-new",
    subject: "account-1",
    token: "token-new",
    tokenExpireAt: new Date(Date.now() + 60_000),
    type: "access",
    ...overrides,
  };
}

function authService(overrides: Partial<AuthService> = {}): AuthService {
  return {
    getAuthorizer: vi.fn(),
    getSessionByKey: vi.fn(),
    login: vi.fn(),
    loginByOAuth: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn().mockResolvedValue({
      data: session(),
      request: new Request("http://localhost"),
      response: new Response(),
    }),
    ...overrides,
  } as AuthService;
}

function stargate(
  auth: AuthService,
  clockToleranceSeconds: number | "omitted" = 30
) {
  const jwt =
    clockToleranceSeconds === "omitted"
      ? ({ algorithm: "HS256", secret: SECRET } as const)
      : ({
          algorithm: "HS256",
          clockToleranceSeconds,
          secret: SECRET,
        } as const);
  return NextStargate({
    auth,
    cookieNames: { refresh: "s-next-refresh", token: "s-next-token" },
    cookieSecure: false,
    jwt,
    pages: { login: "/sign-in", loginRedirect: "/" },
  });
}

function token(expOffsetSeconds: number, extraClaims = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sid: "session-1",
    sub: "account-1",
    type: "access",
    ...extraClaims,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now - 60)
    .setExpirationTime(now + expOffsetSeconds)
    .sign(new TextEncoder().encode(SECRET));
}

beforeEach(() => {
  cookieValues.clear();
  vi.clearAllMocks();
  mocks.cookies.mockResolvedValue(cookieStore);
  mocks.headers.mockResolvedValue({ get: vi.fn().mockReturnValue(null) });
  mocks.redirect.mockImplementation((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  });
});

describe("NextStargate session state machine", () => {
  it("returns a valid token session without refreshing", async () => {
    const auth = authService();
    cookieValues.set("s-next-token", await token(60));

    await expect(stargate(auth).loadSession()).resolves.toMatchObject({
      id: "session-1",
      subject: "account-1",
      type: "access",
    });
    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it("refreshes an expired token and writes both cookies to the response", async () => {
    const auth = authService();
    cookieValues.set("s-next-token", await token(-40));
    cookieValues.set("s-next-refresh", "refresh-old");
    const response = NextResponse.next();

    await expect(stargate(auth).loadSession(response)).resolves.toMatchObject({
      id: "session-1",
      subject: "account-1",
    });
    expect(auth.refresh).toHaveBeenCalledTimes(1);
    expect(response.cookies.get("s-next-token")?.value).toBe("token-new");
    expect(response.cookies.get("s-next-refresh")?.value).toBe("refresh-new");
  });

  it("deletes response cookies when refresh fails", async () => {
    const auth = authService({
      refresh: vi.fn().mockRejectedValue(new Error("no")),
    });
    cookieValues.set("s-next-token", await token(-40));
    cookieValues.set("s-next-refresh", "refresh-old");
    const response = NextResponse.next();

    await expect(stargate(auth).loadSession(response)).resolves.toBeUndefined();
    const headers = response.headers.getSetCookie();
    expect(headers).toHaveLength(2);
    for (const name of ["s-next-token", "s-next-refresh"]) {
      const header = headers.find((value) => value.startsWith(`${name}=`));
      expect(header).toBeDefined();
      expect(hasCookieDeletionSemantics(header ?? "")).toBe(true);
    }
  });

  it("does not attempt Cookie writes without a response", async () => {
    const auth = authService({
      refresh: vi.fn().mockRejectedValue(new Error("no")),
    });
    cookieValues.set("s-next-token", await token(-40));
    cookieValues.set("s-next-refresh", "refresh-old");

    await expect(stargate(auth).loadSession()).resolves.toBeUndefined();
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });

  it("leaves an unmutated source response when no refresh cookie exists", async () => {
    const auth = authService();
    cookieValues.set("s-next-token", "invalid-token");
    const response = NextResponse.next();

    await expect(stargate(auth).loadSession(response)).resolves.toBeUndefined();
    expect(auth.refresh).not.toHaveBeenCalled();
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("redirects from ensureSession when no session can be loaded", async () => {
    await expect(stargate(authService()).ensureSession()).rejects.toThrow(
      "REDIRECT:/sign-in"
    );
  });

  it("keeps the refresh cookie alive when rememberMe is omitted", async () => {
    const loggedIn = session({
      expireAt: new Date("2030-01-01T00:00:00.000Z"),
      tokenExpireAt: new Date("2026-08-01T00:00:02.000Z"),
    });
    const auth = authService({
      login: vi.fn().mockResolvedValue({
        data: loggedIn,
        request: new Request("http://localhost"),
        response: new Response(),
      }),
    });

    await expect(
      stargate(auth).signIn(
        { login: "stargate", password: "secret" },
        {
          from: "/",
        }
      )
    ).rejects.toThrow("REDIRECT:/");

    expect(cookieStore.set).toHaveBeenCalledTimes(2);
    expect(cookieStore.set).toHaveBeenNthCalledWith(
      1,
      "s-next-token",
      loggedIn.token,
      expect.objectContaining({ expires: loggedIn.tokenExpireAt })
    );
    expect(cookieStore.set).toHaveBeenNthCalledWith(
      2,
      "s-next-refresh",
      loggedIn.key,
      expect.objectContaining({ expires: loggedIn.expireAt })
    );
  });

  it("signs out through the Server Action cookie path", async () => {
    const auth = authService();
    cookieValues.set("s-next-token", await token(60));
    cookieValues.set("s-next-refresh", "refresh-old");

    await expect(stargate(auth).signOut()).rejects.toThrow("REDIRECT:/sign-in");
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(cookieStore.delete).toHaveBeenCalledWith("s-next-token");
    expect(cookieStore.delete).toHaveBeenCalledWith("s-next-refresh");
  });

  it("does not project authorization claims into the next session", async () => {
    cookieValues.set("s-next-token", await token(60));
    const loaded = await stargate(authService()).loadSession();
    expect(loaded?.groups).toBeUndefined();
    expect(loaded?.ns).toBeUndefined();
    expect(loaded?.permissions).toBeUndefined();
    expect(loaded?.roles).toBeUndefined();
  });

  it("applies tolerance to next tokens but not zero-tolerance legacy tokens", async () => {
    const expired = await token(-20);
    cookieValues.set("s-next-token", expired);
    await expect(
      stargate(authService(), 30).loadSession()
    ).resolves.toMatchObject({
      id: "session-1",
    });

    cookieValues.set("s-next-token", expired);
    await expect(
      stargate(authService(), 0).loadSession()
    ).resolves.toBeUndefined();
    cookieValues.set("s-next-token", expired);
    await expect(
      stargate(authService(), "omitted").loadSession()
    ).resolves.toBeUndefined();
  });

  it("keeps legacy cookie literals equal to next-stargate defaults", () => {
    expect(legacySessionCookieNames).toEqual(defaultSessionCookieNames);
  });
});
