import { describe, expect, it } from "vitest";

import { isCookieSecure } from "./stargate";

describe("isCookieSecure", () => {
  it("disables secure cookies for HTTP requests", () => {
    expect(isCookieSecure(true, "http")).toBe(false);
  });

  it("keeps secure cookies for HTTPS requests", () => {
    expect(isCookieSecure(true, "https")).toBe(true);
  });

  it("uses the original protocol when proxies append values", () => {
    expect(isCookieSecure(true, "http, https")).toBe(false);
  });

  it("preserves disabled and missing-protocol defaults", () => {
    expect(isCookieSecure(false, "https")).toBe(false);
    expect(isCookieSecure(true, null)).toBe(true);
  });
});
