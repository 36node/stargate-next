import { describe, expect, it } from "vitest";

import { loadStargateConfig } from "../src/config";
import type {
  AccountCollection,
  AuthTokens,
  Captcha,
  PublicAccount,
  Session,
} from "../src/contracts";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];
type Assert<T extends true> = T;
type IsJsonSafe<T> = T extends JsonValue ? true : false;

type _AccountIsJsonSafe = Assert<IsJsonSafe<PublicAccount>>;
type _CollectionIsJsonSafe = Assert<IsJsonSafe<AccountCollection>>;
type _TokensAreJsonSafe = Assert<IsJsonSafe<AuthTokens>>;
type _CaptchaIsJsonSafe = Assert<IsJsonSafe<Captcha>>;
type _SessionIsJsonSafe = Assert<IsJsonSafe<Session>>;

const environment = {
  CAPTCHA_HMAC_SECRET: "captcha-secret",
  REFRESH_KEY_HMAC_PRIMARY_KEY_ID: "primary",
  REFRESH_KEY_HMAC_PRIMARY_SECRET: "primary-secret",
  STARGATE_ADMIN_API_KEY: "admin-api-key",
  STARGATE_API_KEY: "api-key",
  STARGATE_DEPLOY_TIER: "test",
  STARGATE_JWT_SECRET: "jwt-secret",
  TENANT_API_KEY_HMAC_PRIMARY_KEY_ID: "tenant-primary",
  TENANT_API_KEY_HMAC_PRIMARY_SECRET: "tenant-primary-secret",
};

describe("stargate service contracts", () => {
  it("loads config without relying on module initialization", () => {
    expect(loadStargateConfig(environment)).toMatchObject({
      accountCreateIdempotencyTtlSeconds: 3600,
      apiKey: "api-key",
      captchaAttempts: 5,
      redisKeyPrefix: "stargate-next:",
    });
  });

  it("allows overriding account create idempotency ttl", () => {
    expect(
      loadStargateConfig({
        ...environment,
        ACCOUNT_CREATE_IDEMPOTENCY_TTL_SECONDS: "7200",
      }).accountCreateIdempotencyTtlSeconds
    ).toBe(7200);
  });

  it("rejects an incomplete secondary refresh key", () => {
    expect(() =>
      loadStargateConfig({
        ...environment,
        REFRESH_KEY_HMAC_SECONDARY_KEY_ID: "secondary",
      })
    ).toThrow("must be configured together");
  });

  it("requires and normalizes a fixed code in captcha test mode", () => {
    expect(
      loadStargateConfig({
        ...environment,
        CAPTCHA_TEST_CODE: "a1b2",
        CAPTCHA_TEST_MODE: "true",
      }).captchaTestCode
    ).toBe("A1B2");
    expect(() =>
      loadStargateConfig({
        ...environment,
        CAPTCHA_TEST_MODE: "true",
      })
    ).toThrow("CAPTCHA_TEST_CODE must be configured");
  });

  it("rejects an invalid fixed captcha code", () => {
    expect(() =>
      loadStargateConfig({
        ...environment,
        CAPTCHA_TEST_CODE: "12345",
        CAPTCHA_TEST_MODE: "true",
      })
    ).toThrow(
      "CAPTCHA_TEST_CODE must contain exactly 4 ASCII letters or digits"
    );
  });
});
