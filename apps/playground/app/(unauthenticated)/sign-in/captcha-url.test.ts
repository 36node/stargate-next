import { describe, expect, it } from "vitest";

import { captchaUrl } from "./captcha-url";

describe("captchaUrl", () => {
  it("binds each captcha reload to the selected tenant", () => {
    expect(captchaUrl("default")).toBe("/api/captcha?tenant=default");
    expect(captchaUrl("test")).toBe("/api/captcha?tenant=test");
    expect(captchaUrl("tenant with spaces")).toBe(
      "/api/captcha?tenant=tenant%20with%20spaces"
    );
  });
});
