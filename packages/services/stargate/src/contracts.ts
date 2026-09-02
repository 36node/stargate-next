export type RequestContext = {
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

export type ActorType =
  | "account"
  | "admin"
  | "anonymous"
  | "service"
  | "tenant_key";

export type TenantStatus = "active" | "disabled";

export type TenantSettings = {
  loginCaptchaRequired?: boolean;
};

declare const tenantScopeBrand: unique symbol;
declare const adminScopeBrand: unique symbol;

export type TenantScope = {
  readonly actorId?: string;
  readonly actorType: ActorType;
  readonly tenantId: string;
  readonly [tenantScopeBrand]: true;
};

export type AdminScope = {
  readonly actorType: "admin";
  readonly [adminScopeBrand]: true;
};

export type AccountInput = {
  username: string;
  phone?: string | null;
  email?: string | null;
  password: string;
  active?: boolean;
  idempotencyKey?: string;
};

export type AccountPatchInput = {
  active?: boolean;
  email?: string | null;
  phone?: string | null;
  username?: string;
};

export type LoginInput = {
  captchaCode?: string;
  captchaId?: string;
  login: string;
  password: string;
};

export type PublicAccount = {
  active: boolean;
  createdAt: string;
  email: string | null;
  id: string;
  phone: string | null;
  tenantId: string;
  updatedAt: string;
  username: string;
};

export type AccountCollection = {
  data: Array<{ attributes: PublicAccount; id: string; type: "accounts" }>;
  links: { self: string; next?: string };
  meta: { page: { limit: number; offset: number; total: number } };
};

export type AuthTokens = {
  accessToken: string;
  accessTokenExpiresAt: string;
  accountId: string;
  refreshExpiresAt: string;
  refreshKey: string;
  sessionId: string;
  tenantId: string;
};

export type Captcha = {
  id: string;
  imageDataUri: string;
};

export type Session = {
  createdAt: string;
  expiresAt: string;
  id: string;
  updatedAt: string;
};

export type AccessTokenClaims = {
  accountId: string;
  sessionId: string;
  tenantId: string;
};

export type PublicTenant = {
  createdAt: string;
  id: string;
  name: string | null;
  status: TenantStatus;
  settings: TenantSettings;
  updatedAt: string;
};

export type TenantInput = {
  id?: string;
  name?: string | null;
  settings?: TenantSettings;
};
export type TenantPatchInput = {
  name?: string | null;
  settings?: TenantSettings;
  status?: TenantStatus;
};

export type TenantCollection = {
  data: Array<{ attributes: PublicTenant; id: string; type: "tenants" }>;
  links: { self: string; next?: string };
  meta: { page: { limit: number; offset: number; total: number } };
};

export type PublicTenantApiKey = {
  createdAt: string;
  firstFour: string;
  id: string;
  name: string | null;
  tenantId: string;
  updatedAt: string;
};

export type CreatedTenantApiKey = PublicTenantApiKey & { key: string };
export type TenantApiKeyInput = { name?: string | null };
export type TenantApiKeyPatchInput = { name: string | null };

export type TenantApiKeyCollection = {
  data: Array<{
    attributes: PublicTenantApiKey;
    id: string;
    type: "tenant-api-keys";
  }>;
  links: { self: string; next?: string };
  meta: { page: { limit: number; offset: number; total: number } };
};

export type StargateErrorCategory =
  | "conflict"
  | "invalid_argument"
  | "not_found"
  | "rate_limited"
  | "unauthenticated";

export type StargateErrorCode =
  | "ACCESS_TOKEN_INVALID"
  | "ACCOUNT_IDENTIFIER_CONFLICT"
  | "ACCOUNT_NOT_FOUND"
  | "API_KEY_INVALID"
  | "BATCH_INVALID"
  | "BODY_INVALID"
  | "CAPTCHA_CODE_INVALID"
  | "CAPTCHA_ID_INVALID"
  | "CAPTCHA_INVALID"
  | "CAPTCHA_RATE_LIMITED"
  | "CURRENT_PASSWORD_INVALID"
  | "EMAIL_INVALID"
  | "IDEMPOTENCY_CONFLICT"
  | "IDEMPOTENCY_IN_PROGRESS"
  | "LOGIN_IDENTIFIER_INVALID"
  | "LOGIN_INVALID"
  | "LOGIN_LOCKED"
  | "PAGE_INVALID"
  | "PASSWORD_CHANGE_LOCKED"
  | "PASSWORD_INVALID"
  | "PATCH_INVALID"
  | "PHONE_INVALID"
  | "REFRESH_INVALID"
  | "REFRESH_KEY_INVALID"
  | "TENANT_ALREADY_EXISTS"
  | "TENANT_API_KEY_NOT_FOUND"
  | "TENANT_API_KEY_SELF_DELETE"
  | "TENANT_DISABLED"
  | "TENANT_ID_INVALID"
  | "TENANT_INVALID"
  | "TENANT_NOT_FOUND"
  | "USERNAME_INVALID";

export type HealthCheck =
  | { latencyMs: number; ok: true }
  | { error: string; latencyMs: number; ok: false };

export type StargateHealth = {
  database: HealthCheck;
  redis: HealthCheck;
};

export type StargateServiceContract = {
  resolveApiCredential(
    apiKey: string | undefined,
    tenantHeader: string | undefined
  ): Promise<TenantScope>;
  resolveAdminCredential(apiKey: string | undefined): AdminScope;
  accessTokenClaims(authorization: string | undefined): AccessTokenClaims;

  createTenant(
    scope: AdminScope,
    input: TenantInput,
    context: RequestContext
  ): Promise<PublicTenant>;
  getTenant(scope: AdminScope, tenantId: string): Promise<PublicTenant>;
  listTenants(
    scope: AdminScope,
    limit: number,
    offset: number,
    basePath: string,
    name?: string
  ): Promise<TenantCollection>;
  patchTenant(
    scope: AdminScope,
    tenantId: string,
    input: TenantPatchInput,
    context: RequestContext
  ): Promise<PublicTenant>;

  createTenantApiKey(
    scope: TenantScope,
    input: TenantApiKeyInput,
    context: RequestContext
  ): Promise<CreatedTenantApiKey>;
  listTenantApiKeys(
    scope: TenantScope,
    limit: number,
    offset: number,
    basePath: string
  ): Promise<TenantApiKeyCollection>;
  patchTenantApiKey(
    scope: TenantScope,
    keyId: string,
    input: TenantApiKeyPatchInput
  ): Promise<PublicTenantApiKey>;
  deleteTenantApiKey(
    scope: TenantScope,
    keyId: string,
    context: RequestContext
  ): Promise<void>;

  createCaptcha(
    tenantHeader: string | undefined,
    context: RequestContext
  ): Promise<Captcha>;
  verifyCaptcha(
    tenantHeader: string | undefined,
    id: string,
    code: string
  ): Promise<boolean>;
  login(
    tenantHeader: string | undefined,
    input: LoginInput,
    context: RequestContext
  ): Promise<AuthTokens>;
  refresh(
    tenantHeader: string | undefined,
    refreshKey: string,
    context: RequestContext
  ): Promise<AuthTokens>;
  logout(
    tenantHeader: string | undefined,
    authorization: string | undefined,
    context: RequestContext
  ): Promise<void>;
  /**
   * 用户自助修改当前 Account 的密码。
   * rawBody 必须保持 unknown，由领域服务按安全优先级完成唯一一次 body 校验。
   */
  selfChangePassword(
    tenantHeader: string | undefined,
    authorization: string | undefined,
    rawBody: unknown,
    context: RequestContext
  ): Promise<void>;

  createAccount(
    scope: TenantScope,
    input: AccountInput,
    context: RequestContext
  ): Promise<PublicAccount>;
  getAccount(scope: TenantScope, id: string): Promise<PublicAccount>;
  batchGet(scope: TenantScope, ids: string[]): Promise<PublicAccount[]>;
  listAccounts(
    scope: TenantScope,
    limit: number,
    offset: number,
    basePath: string
  ): Promise<AccountCollection>;
  patchAccount(
    scope: TenantScope,
    id: string,
    input: AccountPatchInput,
    context: RequestContext
  ): Promise<PublicAccount>;
  changePassword(
    scope: TenantScope,
    id: string,
    password: string,
    context: RequestContext
  ): Promise<void>;
  deleteAccount(
    scope: TenantScope,
    id: string,
    context: RequestContext
  ): Promise<void>;
  listSessions(scope: TenantScope, accountId: string): Promise<Session[]>;
  revokeSessions(
    scope: TenantScope,
    accountId: string,
    context: RequestContext,
    reason: string,
    sessionId?: string
  ): Promise<void>;
};
