/** Stargate 认证配置的解析、组合约束与密钥隔离回归。 */
import { describe, expect, it } from "vitest";

import { loadStargateConfig } from "../src/config";

const baseEnvironment: NodeJS.ProcessEnv = {
  CAPTCHA_HMAC_SECRET: "captcha-secret",
  REFRESH_KEY_HMAC_PRIMARY_KEY_ID: "primary",
  REFRESH_KEY_HMAC_PRIMARY_SECRET: "primary-secret",
  STARGATE_API_KEY: "api-key",
  STARGATE_JWT_SECRET: "jwt-secret",
};

function environment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ...baseEnvironment, ...overrides };
}

describe("stargate config", () => {
  it("rejects captcha test mode in production", () => {
    expect(() =>
      loadStargateConfig(
        environment({
          CAPTCHA_TEST_CODE: "A1B2",
          CAPTCHA_TEST_MODE: "true",
          NODE_ENV: "production",
        })
      )
    ).toThrow("CAPTCHA_TEST_MODE cannot be enabled in production");
  });

  it("requires and validates the fixed captcha code", () => {
    expect(() =>
      loadStargateConfig(environment({ CAPTCHA_TEST_MODE: "true" }))
    ).toThrow("CAPTCHA_TEST_CODE must be configured");
    for (const code of ["ABC", "ABCDE", "AB-D"]) {
      expect(() =>
        loadStargateConfig(
          environment({ CAPTCHA_TEST_CODE: code, CAPTCHA_TEST_MODE: "true" })
        )
      ).toThrow(
        "CAPTCHA_TEST_CODE must contain exactly 4 ASCII letters or digits"
      );
    }
    expect(
      loadStargateConfig(
        environment({ CAPTCHA_TEST_CODE: "abcd", CAPTCHA_TEST_MODE: "true" })
      ).captchaTestCode
    ).toBe("ABCD");
  });

  it("validates the optional secondary refresh key pair", () => {
    expect(() =>
      loadStargateConfig(
        environment({ REFRESH_KEY_HMAC_SECONDARY_KEY_ID: "secondary" })
      )
    ).toThrow("must be configured together");
    expect(() =>
      loadStargateConfig(
        environment({ REFRESH_KEY_HMAC_SECONDARY_SECRET: "secondary-secret" })
      )
    ).toThrow("must be configured together");
    expect(() =>
      loadStargateConfig(
        environment({
          REFRESH_KEY_HMAC_SECONDARY_KEY_ID: "primary",
          REFRESH_KEY_HMAC_SECONDARY_SECRET: "secondary-secret",
        })
      )
    ).toThrow("refresh HMAC key ids must be distinct");
    expect(
      loadStargateConfig(
        environment({
          REFRESH_KEY_HMAC_SECONDARY_KEY_ID: "secondary",
          REFRESH_KEY_HMAC_SECONDARY_SECRET: "secondary-secret",
        })
      ).secondary
    ).toEqual({ id: "secondary", secret: "secondary-secret" });
  });

  it("uses strict decimal syntax only for JWT clock tolerance", () => {
    expect(loadStargateConfig(environment()).clockToleranceSeconds).toBe(30);
    expect(
      loadStargateConfig(environment({ JWT_CLOCK_TOLERANCE_SECONDS: "0" }))
        .clockToleranceSeconds
    ).toBe(0);
    expect(
      loadStargateConfig(environment({ JWT_CLOCK_TOLERANCE_SECONDS: "30" }))
        .clockToleranceSeconds
    ).toBe(30);

    for (const value of [
      "",
      "-1",
      "1.5",
      "abc",
      "  ",
      "+1",
      "01",
      "1e3",
      "0x10",
      "9007199254740993",
    ]) {
      expect(() =>
        loadStargateConfig(environment({ JWT_CLOCK_TOLERANCE_SECONDS: value }))
      ).toThrow("JWT_CLOCK_TOLERANCE_SECONDS");
    }
  });

  it("preserves existing positive integer parser behavior", () => {
    for (const [value, expected] of [
      ["1e3", 1000],
      ["0x10", 16],
      ["01", 1],
    ] as const) {
      expect(
        loadStargateConfig(
          environment({
            ACCESS_TOKEN_TTL_SECONDS: value,
            JWT_CLOCK_TOLERANCE_SECONDS: "0",
          })
        ).tokenTtlSeconds
      ).toBe(expected);
    }
    expect(() =>
      loadStargateConfig(
        environment({
          ACCESS_TOKEN_TTL_SECONDS: "",
          JWT_CLOCK_TOLERANCE_SECONDS: "0",
        })
      )
    ).toThrow("ACCESS_TOKEN_TTL_SECONDS must be a positive integer");
  });

  it("enforces clock tolerance against token TTL independently", () => {
    expect(() =>
      loadStargateConfig(environment({ ACCESS_TOKEN_TTL_SECONDS: "59" }))
    ).toThrow("must not exceed half");
    expect(
      loadStargateConfig(environment({ ACCESS_TOKEN_TTL_SECONDS: "60" }))
        .tokenTtlSeconds
    ).toBe(60);
    expect(
      loadStargateConfig(
        environment({
          ACCESS_TOKEN_TTL_SECONDS: "1",
          JWT_CLOCK_TOLERANCE_SECONDS: "0",
        })
      ).tokenTtlSeconds
    ).toBe(1);
    expect(
      loadStargateConfig(
        environment({
          ACCESS_TOKEN_TTL_SECONDS: "3600",
          JWT_CLOCK_TOLERANCE_SECONDS: "1800",
        })
      ).clockToleranceSeconds
    ).toBe(1800);
    expect(() =>
      loadStargateConfig(
        environment({
          ACCESS_TOKEN_TTL_SECONDS: "3600",
          JWT_CLOCK_TOLERANCE_SECONDS: "1801",
        })
      )
    ).toThrow("must not exceed half");
  });

  it("requires every primary service secret", () => {
    for (const name of [
      "STARGATE_JWT_SECRET",
      "CAPTCHA_HMAC_SECRET",
      "STARGATE_API_KEY",
      "REFRESH_KEY_HMAC_PRIMARY_KEY_ID",
      "REFRESH_KEY_HMAC_PRIMARY_SECRET",
    ]) {
      const value = environment();
      delete value[name];
      expect(() => loadStargateConfig(value)).toThrow(
        `${name} must be configured`
      );
    }
  });

  it("rejects secret reuse across all roles", () => {
    const cases: NodeJS.ProcessEnv[] = [
      { STARGATE_JWT_SECRET: "captcha-secret" },
      { REFRESH_KEY_HMAC_PRIMARY_SECRET: "captcha-secret" },
      { REFRESH_KEY_HMAC_PRIMARY_SECRET: "jwt-secret" },
      {
        REFRESH_KEY_HMAC_SECONDARY_KEY_ID: "secondary",
        REFRESH_KEY_HMAC_SECONDARY_SECRET: "captcha-secret",
      },
      {
        REFRESH_KEY_HMAC_SECONDARY_KEY_ID: "secondary",
        REFRESH_KEY_HMAC_SECONDARY_SECRET: "jwt-secret",
      },
      {
        REFRESH_KEY_HMAC_SECONDARY_KEY_ID: "secondary",
        REFRESH_KEY_HMAC_SECONDARY_SECRET: "primary-secret",
      },
    ];
    for (const overrides of cases) {
      expect(() => loadStargateConfig(environment(overrides))).toThrow(
        "must not share the same value"
      );
    }
    expect(() =>
      loadStargateConfig(
        environment({
          REFRESH_KEY_HMAC_SECONDARY_KEY_ID: "secondary",
          REFRESH_KEY_HMAC_SECONDARY_SECRET: "secondary-secret",
        })
      )
    ).not.toThrow();
  });
});
