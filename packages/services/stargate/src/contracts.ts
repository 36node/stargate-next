export type RequestContext = {
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

export type AccountInput = {
  username: string;
  phone?: string | null;
  email?: string | null;
  password: string;
  active?: boolean;
  idempotencyKey?: string;
};

export type AccountPatchInput = Omit<
  AccountInput,
  "password" | "idempotencyKey"
>;

export type LoginInput = {
  captchaCode: string;
  captchaId: string;
  login: string;
  password: string;
};

export type PublicAccount = {
  active: boolean;
  createdAt: string;
  email: string | null;
  id: string;
  phone: string | null;
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
};

export type Captcha = {
  id: string;
  imageDataUri: string;
  testCode?: string;
};

export type Session = {
  createdAt: string;
  expiresAt: string;
  id: string;
  updatedAt: string;
};

export type AccessTokenClaims = { accountId: string; sessionId: string };

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
  | "CAPTCHA_INVALID"
  | "CAPTCHA_RATE_LIMITED"
  | "EMAIL_INVALID"
  | "IDEMPOTENCY_CONFLICT"
  | "IDEMPOTENCY_IN_PROGRESS"
  | "IDEMPOTENCY_KEY_INVALID"
  | "LOGIN_INVALID"
  | "LOGIN_LOCKED"
  | "PASSWORD_INVALID"
  | "PHONE_INVALID"
  | "REFRESH_INVALID"
  | "USERNAME_INVALID";

export type HealthCheck =
  | { latencyMs: number; ok: true }
  | { error: string; latencyMs: number; ok: false };

export type StargateHealth = {
  database: HealthCheck;
  redis: HealthCheck;
};

export type StargateServiceContract = {
  assertApiKey(apiKey: string | undefined): void;
  accessTokenClaims(authorization: string | undefined): AccessTokenClaims;
  createCaptcha(context: RequestContext): Promise<Captcha>;
  verifyCaptcha(id: string, code: string): Promise<boolean>;
  createAccount(
    input: AccountInput,
    context: RequestContext
  ): Promise<PublicAccount>;
  getAccount(id: string): Promise<PublicAccount>;
  batchGet(ids: string[]): Promise<PublicAccount[]>;
  listAccounts(
    limit: number,
    offset: number,
    basePath: string
  ): Promise<AccountCollection>;
  patchAccount(
    id: string,
    input: AccountPatchInput,
    context: RequestContext
  ): Promise<PublicAccount>;
  changePassword(
    id: string,
    password: string,
    context: RequestContext
  ): Promise<void>;
  deleteAccount(id: string, context: RequestContext): Promise<void>;
  login(input: LoginInput, context: RequestContext): Promise<AuthTokens>;
  refresh(refreshKey: string, context: RequestContext): Promise<AuthTokens>;
  listSessions(accountId: string): Promise<Session[]>;
  revokeSessions(
    accountId: string,
    context: RequestContext,
    reason: string,
    sessionId?: string
  ): Promise<void>;
};
