import type {
  AccountInput,
  AccountPatchInput,
  PublicAccount,
  AccountCollection as ServiceAccountCollection,
  AuthTokens as ServiceAuthTokens,
  Captcha as ServiceCaptcha,
  Session as ServiceSession,
  StargateErrorCode,
} from "@repo/stargate-service";
import { describe, expect, it } from "vitest";

import type {
  Account,
  AccountCollection,
  AuthTokens,
  Captcha,
  CreateAccountInput,
  PatchAccountInput,
  ErrorCode as SdkErrorCode,
  Session,
} from "../../../packages/stargate-next-sdk/src/generated";

type Assert<T extends true> = T;
type IsAssignable<From, To> = From extends To ? true : false;
type SameKeys<A, B> = [Exclude<keyof A, keyof B>] extends [never]
  ? [Exclude<keyof B, keyof A>] extends [never]
    ? true
    : false
  : false;

type _PublicAccountMatchesApi = Assert<IsAssignable<PublicAccount, Account>>;
type _TokensMatchApi = Assert<IsAssignable<ServiceAuthTokens, AuthTokens>>;
type _CaptchaMatchesApi = Assert<IsAssignable<ServiceCaptcha, Captcha>>;
type _SessionsMatchApi = Assert<IsAssignable<ServiceSession, Session>>;
type _SessionKeys = Assert<SameKeys<ServiceSession, Session>>;
type _SessionApiToService = Assert<IsAssignable<Session, ServiceSession>>;
type _CollectionMatchesApi = Assert<
  IsAssignable<ServiceAccountCollection, AccountCollection>
>;
type _ErrorCodeServiceToApi = Assert<
  IsAssignable<StargateErrorCode, SdkErrorCode>
>;
type _ErrorCodeApiToService = Assert<
  IsAssignable<SdkErrorCode, StargateErrorCode>
>;
type _PatchKeys = Assert<SameKeys<AccountPatchInput, PatchAccountInput>>;
type _PatchServiceToApi = Assert<
  IsAssignable<AccountPatchInput, PatchAccountInput>
>;
type _PatchApiToService = Assert<
  IsAssignable<PatchAccountInput, AccountPatchInput>
>;
type _AccountKeys = Assert<SameKeys<PublicAccount, Account>>;
type _AccountApiToService = Assert<IsAssignable<Account, PublicAccount>>;
type _CollectionKeys = Assert<
  SameKeys<ServiceAccountCollection, AccountCollection>
>;
type _CollectionApiToService = Assert<
  IsAssignable<AccountCollection, ServiceAccountCollection>
>;
type _CreateInputKeys = Assert<SameKeys<AccountInput, CreateAccountInput>>;
type _CreateInputServiceToApi = Assert<
  IsAssignable<AccountInput, CreateAccountInput>
>;
type _CreateInputApiToService = Assert<
  IsAssignable<CreateAccountInput, AccountInput>
>;

describe("service contracts", () => {
  it("are represented by the generated OpenAPI types", () => {
    expect(true).toBe(true);
  });
});
