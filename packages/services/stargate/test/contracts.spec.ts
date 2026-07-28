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
  STARGATE_API_KEY: "api-key",
  STARGATE_JWT_SECRET: "jwt-secret",
};

describe("stargate service contracts", () => {
  it("loads config without relying on module initialization", () => {
    expect(loadStargateConfig(environment)).toMatchObject({
      apiKey: "api-key",
      captchaAttempts: 5,
      redisKeyPrefix: "stargate-next:",
    });
  });

  it("rejects an incomplete secondary refresh key", () => {
    expect(() =>
      loadStargateConfig({
        ...environment,
        REFRESH_KEY_HMAC_SECONDARY_KEY_ID: "secondary",
      })
    ).toThrow("must be configured together");
  });
});
