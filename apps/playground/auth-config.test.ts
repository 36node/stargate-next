/** 认证后端派生的 Cookie 名与 JWT 容差选择回归。 */
import { describe, expect, it } from "vitest";

import {
  legacySessionCookieNames,
  nextSessionCookieNames,
  resolveClockTolerance,
  resolveSessionCookieNames,
  resolveTenantId,
} from "./auth-config";

describe("auth config", () => {
  it("defaults missing backend to the isolated Stargate Next cookies", () => {
    expect(resolveSessionCookieNames(undefined)).toEqual({
      refresh: "s-next-refresh",
      tenant: "s-next-tenant",
      token: "s-next-token",
    });
    expect(resolveSessionCookieNames("next")).toBe(nextSessionCookieNames);
  });

  it("allows only configured Next tenant choices", () => {
    expect(resolveTenantId("test")).toBe("test");
    expect(resolveTenantId("default")).toBe("default");
    expect(resolveTenantId("unknown")).toBe("default");
    expect(resolveTenantId(undefined)).toBe("default");
  });

  it("switches both cookie names together for legacy backends", () => {
    expect(resolveSessionCookieNames("local")).toBe(legacySessionCookieNames);
    expect(resolveSessionCookieNames("local")).toEqual({
      refresh: "s-refresh",
      token: "s-token",
    });
  });

  it("applies configured tolerance only to Stargate Next", () => {
    expect(resolveClockTolerance(undefined, 30)).toBe(30);
    expect(resolveClockTolerance("next", 30)).toBe(30);
    expect(resolveClockTolerance("next", 0)).toBe(0);
    expect(resolveClockTolerance("local", 30)).toBe(0);
    expect(resolveClockTolerance("legacy", 45)).toBe(0);
  });
});
