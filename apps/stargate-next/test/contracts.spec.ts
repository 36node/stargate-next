import type {
  PublicAccount,
  AccountCollection as ServiceAccountCollection,
  AuthTokens as ServiceAuthTokens,
  Captcha as ServiceCaptcha,
  Session as ServiceSession,
} from "@repo/stargate-service";
import { describe, expect, it } from "vitest";

import type {
  Account,
  AccountCollection,
  AuthTokens,
  Captcha,
  Session,
} from "../../../packages/stargate-next-sdk/src/generated";

type Assert<T extends true> = T;
type IsAssignable<From, To> = From extends To ? true : false;

type _PublicAccountMatchesApi = Assert<IsAssignable<PublicAccount, Account>>;
type _TokensMatchApi = Assert<IsAssignable<ServiceAuthTokens, AuthTokens>>;
type _CaptchaMatchesApi = Assert<IsAssignable<ServiceCaptcha, Captcha>>;
type _SessionsMatchApi = Assert<IsAssignable<ServiceSession, Session>>;
type _CollectionMatchesApi = Assert<
  IsAssignable<ServiceAccountCollection, AccountCollection>
>;

describe("service contracts", () => {
  it("are represented by the generated OpenAPI types", () => {
    expect(true).toBe(true);
  });
});
