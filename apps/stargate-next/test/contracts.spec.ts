import type {
  Account,
  AccountCollection,
  AuthTokens,
  Captcha,
  CreateAccountInput,
  CreatedTenantApiKey,
  CreateTenantInput,
  PatchAccountInput,
  PatchTenantInput,
  ErrorCode as SdkErrorCode,
  Session,
  Tenant,
  TenantApiKey,
  TenantApiKeyCollection,
  TenantCollection,
} from "@repo/stargate-next-sdk";
import type {
  AccountInput,
  AccountPatchInput,
  PublicAccount,
  PublicTenant,
  PublicTenantApiKey,
  AccountCollection as ServiceAccountCollection,
  AuthTokens as ServiceAuthTokens,
  Captcha as ServiceCaptcha,
  CreatedTenantApiKey as ServiceCreatedTenantApiKey,
  Session as ServiceSession,
  TenantApiKeyCollection as ServiceTenantApiKeyCollection,
  TenantCollection as ServiceTenantCollection,
  StargateErrorCode,
  TenantApiKeyInput,
  TenantApiKeyPatchInput,
  TenantInput,
  TenantPatchInput,
} from "@repo/stargate-service";
import { describe, expect, it } from "vitest";

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
type _TenantKeys = Assert<SameKeys<PublicTenant, Tenant>>;
type _TenantServiceToApi = Assert<IsAssignable<PublicTenant, Tenant>>;
type _TenantApiToService = Assert<IsAssignable<Tenant, PublicTenant>>;
type _TenantInputKeys = Assert<SameKeys<TenantInput, CreateTenantInput>>;
type _TenantPatchKeys = Assert<SameKeys<TenantPatchInput, PatchTenantInput>>;
type _TenantCollectionKeys = Assert<
  SameKeys<ServiceTenantCollection, TenantCollection>
>;
type _TenantCollectionServiceToApi = Assert<
  IsAssignable<ServiceTenantCollection, TenantCollection>
>;
type _TenantCollectionApiToService = Assert<
  IsAssignable<TenantCollection, ServiceTenantCollection>
>;
type _TenantApiKeyKeys = Assert<SameKeys<PublicTenantApiKey, TenantApiKey>>;
type _CreatedTenantApiKeyKeys = Assert<
  SameKeys<ServiceCreatedTenantApiKey, CreatedTenantApiKey>
>;
type _TenantApiKeyInputKeys = Assert<
  SameKeys<TenantApiKeyInput, { name?: string | null }>
>;
type _TenantApiKeyPatchInputKeys = Assert<
  SameKeys<TenantApiKeyPatchInput, { name: string | null }>
>;
type _TenantApiKeyCollectionKeys = Assert<
  SameKeys<ServiceTenantApiKeyCollection, TenantApiKeyCollection>
>;

describe("service contracts", () => {
  it("are represented by the generated OpenAPI types", () => {
    expect(true).toBe(true);
  });
});
